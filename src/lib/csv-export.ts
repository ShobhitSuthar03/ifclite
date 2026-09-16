import { GeometryProcessor } from '@ifc-lite/geometry'
import { filterQuantities, type QuantityResult } from '@/lib/geometry-qto'
import { getGeometryProcessor } from '@/lib/ifc-loader'
import { isDesktopShell as isTauri } from '@/lib/host'

export type CsvMode = 'entities' | 'properties' | 'quantities' | 'spatial' | 'areas' | 'formwork'
export type IfcCsvMode = Exclude<CsvMode, 'areas' | 'formwork'>
export type CsvScope = 'all' | 'isolated' | 'visible' | 'selected'
export type CsvDelimiter = ',' | ';' | '\t'

export const CSV_MODES: Array<{ value: CsvMode; label: string; hint: string }> = [
  { value: 'entities', label: 'Entities', hint: 'One row per IfcProduct' },
  { value: 'properties', label: 'Properties', hint: 'One row per property value' },
  { value: 'quantities', label: 'Quantities', hint: 'One row per quantity value' },
  { value: 'spatial', label: 'Spatial', hint: 'Project → site → building → storey' },
  { value: 'areas', label: 'Geometry areas', hint: 'AREAMAX, LATERALAREA, GROSSAREA, … per building element' },
  { value: 'formwork', label: 'Geometry faces', hint: 'One row per extracted face (gross / covered / net)' },
]

export const CSV_SCOPES: Array<{ value: CsvScope; label: string; hint: string }> = [
  { value: 'all', label: 'All', hint: 'Every row in the table' },
  { value: 'isolated', label: 'Isolated', hint: 'Current type / storey / property filter' },
  { value: 'visible', label: 'Visible', hint: 'Elements shown at full opacity in 3D' },
  { value: 'selected', label: 'Selected', hint: 'Every element currently selected' },
]

export const CSV_DELIMITERS: Array<{ value: CsvDelimiter; label: string }> = [
  { value: ',', label: 'Comma' },
  { value: ';', label: 'Semicolon' },
  { value: '\t', label: 'Tab' },
]

export type CsvExportRequest = {
  bytes: Uint8Array
  fileName: string
  mode: IfcCsvMode
  scope: CsvScope
  delimiter: CsvDelimiter
  includeProperties: boolean
  keepIds: Set<number> | null
}

export type CsvExportResult = {
  fileName: string
  text: string
  rowCount: number
}

let wasmProcessor: Promise<GeometryProcessor> | null = null

export async function recycleCsvProcessor(): Promise<void> {
  const pending = wasmProcessor
  wasmProcessor = null
  if (!pending) return
  try {
    const processor = await pending
    processor.dispose()
  } catch {
    // Drop a poisoned CSV WASM instance; the next export builds a new one.
  }
}

async function getCsvProcessor(): Promise<GeometryProcessor> {
  if (!isTauri()) return getGeometryProcessor()
  if (!wasmProcessor) {
    wasmProcessor = (async () => {
      const processor = new GeometryProcessor({ preferNative: false, enableInstancing: false })
      await processor.init()
      return processor
    })()
  }
  return wasmProcessor
}

export async function exportIfcCsv(request: CsvExportRequest): Promise<CsvExportResult> {
  const processor = await getCsvProcessor()
  const includeProperties = request.mode === 'entities' && request.includeProperties
  const raw = processor.exportCsv(request.bytes, request.mode, request.delimiter, includeProperties)
  if (!raw) {
    throw new Error('CSV export needs the WASM geometry engine. It is unavailable on this host.')
  }
  const source = new TextDecoder().decode(raw)
  const { text, rowCount } = request.keepIds
    ? filterCsvByIds(source, request.delimiter, request.keepIds, request.mode === 'spatial')
    : { text: source, rowCount: Math.max(0, parseCsvRecords(source, request.delimiter).length - 1) }
  return {
    fileName: csvFileName(request.fileName, request.mode, request.scope),
    text,
    rowCount,
  }
}

export function csvFileName(fileName: string, mode: CsvMode, scope: CsvScope): string {
  const base = fileName.replace(/\.(ifc|ifczip)$/i, '') || 'model'
  return `${base}-${mode}-${scope}.csv`
}

export function resolveCsvKeepIds(
  scope: CsvScope,
  isolatedIds: Set<number> | null,
  visibleIds: Set<number>,
  selectedIds: Set<number>,
): Set<number> | null {
  switch (scope) {
    case 'all':
      return null
    case 'isolated':
      return isolatedIds ?? new Set()
    case 'visible':
      return visibleIds
    case 'selected':
      return selectedIds.size === 0 ? new Set() : new Set(selectedIds)
  }
}

export function downloadCsvFile(fileName: string, text: string) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}

export function filterCsvByIds(
  csv: string,
  delimiter: string,
  keepIds: Set<number>,
  keepAncestors: boolean,
): { text: string; rowCount: number } {
  const records = parseCsvRecords(csv, delimiter)
  if (records.length === 0) return { text: '', rowCount: 0 }
  const header = records[0]
  const idIndex = header.findIndex((cell) => cell === 'expressId' || cell === 'entityId')
  if (idIndex < 0) return { text: csv, rowCount: Math.max(0, records.length - 1) }

  let allowed = keepIds
  if (keepAncestors) {
    allowed = expandWithAncestors(records, header, keepIds)
  }

  const kept = [header, ...records.slice(1).filter((row) => allowed.has(Number(row[idIndex])))]
  return {
    text: serializeCsvRecords(kept, delimiter),
    rowCount: kept.length - 1,
  }
}

function expandWithAncestors(records: string[][], header: string[], keepIds: Set<number>): Set<number> {
  const idIndex = header.indexOf('expressId')
  const parentIndex = header.indexOf('parentId')
  if (idIndex < 0 || parentIndex < 0) return keepIds
  const parentOf = new Map<number, number | null>()
  for (const row of records.slice(1)) {
    const id = Number(row[idIndex])
    const parentRaw = row[parentIndex]
    parentOf.set(id, parentRaw ? Number(parentRaw) : null)
  }
  const expanded = new Set(keepIds)
  for (const start of keepIds) {
    let current = parentOf.get(start) ?? null
    while (current != null && !expanded.has(current)) {
      expanded.add(current)
      current = parentOf.get(current) ?? null
    }
  }
  return expanded
}

export function parseCsvRecords(csv: string, delimiter: string): string[][] {
  const records: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  const input = csv.replace(/^\uFEFF/, '')

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i]
    if (quoted) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"'
          i += 1
        } else {
          quoted = false
        }
      } else {
        field += char
      }
      continue
    }
    if (char === '"') {
      quoted = true
      continue
    }
    if (char === delimiter) {
      row.push(field)
      field = ''
      continue
    }
    if (char === '\n' || (char === '\r' && input[i + 1] === '\n') || char === '\r') {
      row.push(field)
      field = ''
      if (row.some((cell) => cell.length > 0) || records.length === 0) records.push(row)
      row = []
      if (char === '\r' && input[i + 1] === '\n') i += 1
      continue
    }
    field += char
  }
  if (quoted || field.length > 0 || row.length > 0) {
    row.push(field)
    records.push(row)
  }
  return records
}

export function exportAreasCsv(
  result: QuantityResult,
  fileName: string,
  scope: CsvScope,
  delimiter: CsvDelimiter,
  keepIds: Set<number> | null,
): CsvExportResult {
  const filtered = filterQuantities(result, keepIds)
  const header = [
    'expressId',
    'ifcType',
    'AREAMAX',
    'AREAMIN',
    'LATERALAREA',
    'UNDERAREA',
    'TOPAREA',
    'CROSSAREA',
    'SECTIONAREA',
    'GROSSAREA',
    'FOOTPRINTAREA',
    'VOLUME',
    'LENGTH',
    'WIDTH',
    'HEIGHT',
    'COUNT',
  ]
  const rows: string[][] = [header]
  for (const element of filtered.elements) {
    const m = element.metrics
    rows.push([
      String(element.expressId),
      element.ifcType,
      m.AREAMAX.toFixed(3),
      m.AREAMIN.toFixed(3),
      m.LATERALAREA.toFixed(3),
      m.UNDERAREA.toFixed(3),
      m.TOPAREA.toFixed(3),
      m.CROSSAREA.toFixed(3),
      m.CROSSAREA.toFixed(3),
      m.GROSSAREA.toFixed(3),
      m.FOOTPRINTAREA.toFixed(3),
      m.VOLUME.toFixed(3),
      m.LENGTH.toFixed(3),
      m.WIDTH.toFixed(3),
      m.HEIGHT.toFixed(3),
      String(m.COUNT),
    ])
  }
  return {
    fileName: csvFileName(fileName, 'areas', scope),
    text: serializeCsvRecords(rows, delimiter),
    rowCount: rows.length - 1,
  }
}

export function exportFormworkCsv(
  result: QuantityResult,
  fileName: string,
  scope: CsvScope,
  delimiter: CsvDelimiter,
  keepIds: Set<number> | null,
): CsvExportResult {
  const filtered = filterQuantities(result, keepIds)
  const header = [
    'expressId',
    'ifcType',
    'faceId',
    'kind',
    'nx',
    'ny',
    'nz',
    'grossArea',
  ]
  const rows: string[][] = [header]
  for (const element of filtered.elements) {
    for (const face of element.faces) {
      rows.push([
        String(face.expressId),
        face.ifcType,
        face.faceId,
        face.kind,
        face.normal[0].toFixed(4),
        face.normal[1].toFixed(4),
        face.normal[2].toFixed(4),
        face.grossArea.toFixed(3),
      ])
    }
  }
  return {
    fileName: csvFileName(fileName, 'formwork', scope),
    text: serializeCsvRecords(rows, delimiter),
    rowCount: rows.length - 1,
  }
}

function serializeCsvRecords(records: string[][], delimiter: string): string {
  return records
    .map((row) => row.map((cell) => escapeCsvCell(cell, delimiter)).join(delimiter))
    .join('\n')
}

function escapeCsvCell(value: string, delimiter: string): string {
  const numeric = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(value)
  if (
    !numeric &&
    (/^[=+\-@\t\r]/.test(value) || /^[\uFEFF\u200B\u200E\u00A0\u2028\s]+[=+\-@]/.test(value))
  ) {
    value = `'${value}`
  }
  if (value.includes('"') || value.includes('\n') || value.includes('\r') || value.includes(delimiter)) {
    return `"${value.replaceAll('"', '""')}"`
  }
  return value
}
