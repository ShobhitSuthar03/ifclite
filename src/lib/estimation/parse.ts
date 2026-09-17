import { parsePropertyRef, parsePropertyRefs, type PropertyRef } from '@/lib/property-tree'
import { uniquePositiveIds } from '@/lib/saved-views'
import { parseParameterOverrides } from '@/lib/cost-assembly/params'
import { parseExcludedLines } from '@/lib/estimation/include'
import { parseParamBindings } from '@/lib/estimation/param-bind'
import { parseQtyBindings } from '@/lib/estimation/qty-bind'
import {
  emptyBoq,
  emptyEstimation,
  type BoqDoc,
  type BoqNode,
  type EstimationDoc,
} from '@/lib/estimation/types'

export function parseEstimation(value: unknown): EstimationDoc {
  if (!value || typeof value !== 'object') return emptyEstimation()
  const row = value as { boqs?: unknown; activeId?: unknown }
  if (Array.isArray(row.boqs)) {
    const seen = new Set<string>()
    const boqs: BoqDoc[] = []
    for (const [index, item] of row.boqs.entries()) {
      const sheet = parseBoqDoc(item, `boq-${index + 1}`, seen)
      if (sheet) boqs.push(sheet)
    }
    if (boqs.length === 0) return emptyEstimation()
    const activeId =
      typeof row.activeId === 'string' && boqs.some((item) => item.id === row.activeId)
        ? row.activeId
        : boqs[0].id
    return { activeId, boqs }
  }
  const seen = new Set<string>()
  const sheet = parseBoqDoc(value, 'boq-1', seen) ?? emptyBoq({ id: 'boq-1', name: 'BOQ 1' })
  return { activeId: sheet.id, boqs: [sheet] }
}

function parseBoqDoc(value: unknown, fallbackId: string, seen: Set<string>): BoqDoc | null {
  if (!value || typeof value !== 'object') return null
  const row = value as {
    id?: unknown
    name?: unknown
    groupBy?: unknown
    linkProperty?: unknown
    root?: unknown
    qtyBindings?: unknown
    excludedLines?: unknown
    parameterOverrides?: unknown
    parameterBindings?: unknown
  }
  let id = typeof row.id === 'string' ? row.id.trim() : ''
  if (!id || seen.has(id)) id = fallbackId
  if (seen.has(id)) id = `${fallbackId}-${seen.size + 1}`
  seen.add(id)
  return {
    id,
    name: typeof row.name === 'string' ? row.name.trim() : '',
    groupBy: parsePropertyRefs(row.groupBy),
    linkProperty: parseLinkProperty(row),
    root: parseBoqNodes(row.root),
    qtyBindings: parseQtyBindings(row.qtyBindings),
    excludedLines: parseExcludedLines(row.excludedLines),
    parameterOverrides: parseParameterOverrides(row.parameterOverrides),
    parameterBindings: parseParamBindings(row.parameterBindings),
  }
}

function parseBoqNodes(value: unknown): BoqNode[] {
  if (!Array.isArray(value)) return []
  const nodes: BoqNode[] = []
  const seen = new Set<string>()
  for (const item of value) {
    const node = parseBoqNode(item, seen)
    if (node) nodes.push(node)
  }
  return nodes
}

function parseBoqNode(value: unknown, seen: Set<string>): BoqNode | null {
  if (!value || typeof value !== 'object') return null
  const row = value as {
    id?: unknown
    name?: unknown
    kind?: unknown
    source?: unknown
    ids?: unknown
    assemblyId?: unknown
    code?: unknown
    assemblyCode?: unknown
    qtyTakeoff?: unknown
    matchProperty?: unknown
    matchValue?: unknown
    children?: unknown
  }
  const id = typeof row.id === 'string' ? row.id : ''
  const name = typeof row.name === 'string' ? row.name.trim() : ''
  if (!id || !name || seen.has(id)) return null
  const kind = row.kind === 'heading' ? 'heading' : 'item'
  const source = row.source === 'manual' ? 'manual' : row.source === 'import' ? 'import' : 'property'
  const ids = Array.isArray(row.ids)
    ? uniquePositiveIds(row.ids.filter((entry) => typeof entry === 'number'))
    : []
  seen.add(id)
  const children = parseBoqNodes(row.children)
  const code = typeof row.code === 'string' && row.code.trim() ? row.code.trim() : null
  const assemblyCode =
    typeof row.assemblyCode === 'string' && row.assemblyCode.trim() ? row.assemblyCode.trim() : null
  const qtyTakeoff =
    typeof row.qtyTakeoff === 'string' && row.qtyTakeoff.trim() ? row.qtyTakeoff.trim() : null
  return {
    id,
    name,
    kind: children.length > 0 ? 'heading' : kind,
    source,
    ids,
    assemblyId: typeof row.assemblyId === 'string' && row.assemblyId ? row.assemblyId : null,
    code,
    assemblyCode,
    qtyTakeoff,
    matchProperty: parsePropertyRef(row.matchProperty),
    matchValue: typeof row.matchValue === 'string' && row.matchValue.trim() ? row.matchValue.trim() : null,
    children,
  }
}

function parseLinkProperty(row: { linkProperty?: unknown; groupBy?: unknown }): PropertyRef | null {
  const direct = parsePropertyRef(row.linkProperty)
  if (direct) return direct
  if (Array.isArray(row.linkProperty)) return parsePropertyRefs(row.linkProperty)[0] ?? null
  return null
}
