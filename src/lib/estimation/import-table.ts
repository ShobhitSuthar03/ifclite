import { normalizeAssemblyCode, valueMatchesCode } from '@/lib/cost-assembly/links'
import type { CostAssembly } from '@/lib/cost-assembly/types'
import { TAKEOFF_QTY_FIELDS } from '@/lib/estimation/qty-bind'
import { emptyBoq, newBoqId, type BoqDoc, type BoqKind, type BoqNode } from '@/lib/estimation/types'
import { parseMatchPropertyText } from '@/lib/estimation/bind'
import type { AreaMetricKey } from '@/lib/geometry-qto'

export const BOQ_IMPORT_MAX_BYTES = 20 * 1024 * 1024

export type BoqImportRow = {
  kind: BoqKind | ''
  code: string
  parentCode: string
  name: string
  assemblyCode: string
  qtyType: string
  qtyUom: string
  qty2Name: string
  qty2Type: string
  qty2Uom: string
  wbs: string
  notes: string
  matchProperty: string
  matchValue: string
}

export type BoqImportResult = {
  boq: BoqDoc
  warnings: string[]
  itemCount: number
  matchedAssemblies: number
}

const QTO_FIELDS: Record<string, AreaMetricKey> = {
  numberofitems: 'COUNT',
  count: 'COUNT',
  pcs: 'COUNT',
  pc: 'COUNT',
  volume: 'VOLUME',
  lateralarea: 'LATERALAREA',
  basearea: 'FOOTPRINTAREA',
  footprint: 'FOOTPRINTAREA',
  footprintarea: 'FOOTPRINTAREA',
  areamax: 'AREAMAX',
  area: 'GROSSAREA',
  grossarea: 'GROSSAREA',
  toparea: 'TOPAREA',
  underarea: 'UNDERAREA',
  soffit: 'UNDERAREA',
  length: 'LENGTH',
  width: 'WIDTH',
  height: 'HEIGHT',
}

export function mapQtoType(type: string, uom = ''): AreaMetricKey | null {
  const key = type.trim().toLowerCase().replace(/[\s_-]+/g, '')
  if (key && QTO_FIELDS[key]) return QTO_FIELDS[key]
  const unit = uom.trim().toLowerCase().replace(/³/g, '3').replace(/²/g, '2')
  if (unit === 'pc' || unit === 'pcs' || unit === 'nr' || unit === 'st') return 'COUNT'
  if (unit === 'm3') return 'VOLUME'
  if (unit === 'm2') return 'GROSSAREA'
  if (unit === 'm' || unit === 'lm') return 'LENGTH'
  return null
}

export function parseQtoFormula(formula: string): { type: string; uom: string } | null {
  const text = formula.trim()
  if (!text) return null
  const type = text.match(/Type\s*:=\s*"?([^";)]+)"?/i)?.[1]?.trim() ?? ''
  const uom = text.match(/UoM\s*:=\s*"?([^";)]+)"?/i)?.[1]?.trim() ?? ''
  if (!type && !uom) return null
  return { type, uom }
}

export function resolveAssemblyId(
  assemblyCode: string,
  assemblies: Array<Pick<CostAssembly, 'id' | 'code'>>,
): string | null {
  const needle = normalizeAssemblyCode(assemblyCode)
  if (!needle) return null
  const exact = assemblies.filter((item) => normalizeAssemblyCode(item.code) === needle)
  if (exact.length === 1) return exact[0].id
  if (exact.length > 1) return exact[0].id
  const prefixed = assemblies.filter((item) => valueMatchesCode(item.code, assemblyCode))
  if (prefixed.length === 1) return prefixed[0].id
  if (prefixed.length > 1) {
    prefixed.sort((left, right) => normalizeAssemblyCode(left.code).length - normalizeAssemblyCode(right.code).length)
    return prefixed[0].id
  }
  return null
}

export function boqFromImportRows(
  rows: BoqImportRow[],
  options: {
    name: string
    assemblies?: Array<Pick<CostAssembly, 'id' | 'code'>>
  },
): BoqImportResult {
  const warnings: string[] = []
  const assemblies = options.assemblies ?? []
  const nodes = new Map<string, BoqNode>()
  const usedIds = new Set<string>()
  const roots: BoqNode[] = []
  let matchedAssemblies = 0
  let itemCount = 0

  const uniqueId = (code: string, index: number) => {
    const base = `i:${code || `row-${index + 1}`}`
    if (!usedIds.has(base)) {
      usedIds.add(base)
      return base
    }
    let n = 2
    while (usedIds.has(`${base}#${n}`)) n += 1
    const id = `${base}#${n}`
    usedIds.add(id)
    return id
  }

  for (const [index, row] of rows.entries()) {
    const name = row.name.trim()
    const code = row.code.trim()
    if (!name && !code) {
      warnings.push(`Row ${index + 1}: skipped empty line`)
      continue
    }
    const kind: BoqKind =
      row.kind === 'heading' ||
      (row.kind !== 'item' && !row.qtyType.trim() && !row.assemblyCode.trim())
        ? 'heading'
        : 'item'
    const qtyTakeoff = mapQtoType(row.qtyType, row.qtyUom)
    const extra = mapQtoType(row.qty2Type, row.qty2Uom)
    const assemblyCode = row.assemblyCode.trim()
    const assemblyId = assemblyCode ? resolveAssemblyId(assemblyCode, assemblies) : null
    if (assemblyCode && assemblyId) matchedAssemblies += 1
    else if (assemblyCode) warnings.push(`${code || name}: assembly ${assemblyCode} not in catalog`)
    if (row.qtyType && !qtyTakeoff) warnings.push(`${code || name}: unknown QTO type ${row.qtyType}`)
    const matchValue = (row.matchValue.trim() || assemblyCode) || null
    const matchProperty = parseMatchPropertyText(row.matchProperty)
    const node: BoqNode = {
      id: uniqueId(code || name, index),
      name: name || code,
      kind,
      source: 'import',
      ids: [],
      assemblyId,
      code: code || null,
      assemblyCode: assemblyCode || null,
      qtyTakeoff: qtyTakeoff ?? (extra ? extra : null),
      matchProperty,
      matchValue,
      children: [],
    }
    if (kind === 'item') itemCount += 1
    nodes.set(code || node.id, node)
    const parentCode = row.parentCode.trim()
    if (parentCode && nodes.has(parentCode) && parentCode !== code) {
      const parent = nodes.get(parentCode)!
      parent.kind = 'heading'
      parent.children.push(node)
    } else {
      if (parentCode && parentCode !== code) warnings.push(`${code || name}: parent ${parentCode} not found`)
      roots.push(node)
    }
  }

  return {
    boq: emptyBoq({
      id: newBoqId(),
      name: options.name.trim() || 'Imported BOQ',
      root: roots,
    }),
    warnings,
    itemCount,
    matchedAssemblies,
  }
}

export function decodeImportBytes(bytes: Uint8Array): string {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(bytes.subarray(2))
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(bytes.subarray(2))
  }
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(bytes.subarray(3))
  }
  return new TextDecoder('utf-8').decode(bytes)
}

export function assertImportSize(bytes: Uint8Array, fileName: string) {
  if (bytes.byteLength === 0) throw new Error(`${fileName} is empty`)
  if (bytes.byteLength > BOQ_IMPORT_MAX_BYTES) {
    throw new Error(`${fileName} is larger than ${BOQ_IMPORT_MAX_BYTES / (1024 * 1024)} MB`)
  }
}

export function takeoffFieldKnown(field: string): field is AreaMetricKey {
  return TAKEOFF_QTY_FIELDS.some((item) => item.field === field)
}

export function fileStem(fileName: string): string {
  return fileName.replace(/^.*[/\\]/, '').replace(/\.[^.]+$/, '') || 'Imported BOQ'
}
