import { save as saveFileDialog } from '@tauri-apps/plugin-dialog'
import { filterQuantities, type QuantityResult } from '@/lib/geometry-qto'
import { isDesktopShell } from '@/lib/host'
import { writeExportedFile } from '@/lib/projects'
import type { CsvWorkerRequest, CsvWorkerResponse } from '@/lib/csv-export.worker'

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

// `exportCsv` is a single blocking WASM call with no yield points, so it runs
// in a dedicated worker instead of the main thread - otherwise the whole
// window (not just this tab) hangs for however long the export takes.
let csvWorker: Worker | null = null
let csvWorkerRequestId = 0
const csvWorkerPending = new Map<number, { resolve: (text: string) => void; reject: (error: Error) => void }>()

function failAllPending(message: string) {
  for (const pending of csvWorkerPending.values()) pending.reject(new Error(message))
  csvWorkerPending.clear()
}

export async function recycleCsvProcessor(): Promise<void> {
  failAllPending('CSV export was cancelled.')
  csvWorker?.terminate()
  csvWorker = null
}

function getCsvWorker(): Worker {
  if (csvWorker) return csvWorker
  const worker = new Worker(new URL('./csv-export.worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (event: MessageEvent<CsvWorkerResponse>) => {
    const pending = csvWorkerPending.get(event.data.id)
    if (!pending) return
    csvWorkerPending.delete(event.data.id)
    if (event.data.ok) pending.resolve(event.data.text)
    else pending.reject(new Error(event.data.error))
  }
  worker.onerror = (event) => {
    failAllPending(event.message || 'CSV export worker crashed.')
    worker.terminate()
    if (csvWorker === worker) csvWorker = null
  }
  csvWorker = worker
  return worker
}

function exportCsvOffMainThread(
  bytes: Uint8Array,
  mode: string,
  delimiter: string,
  includeProperties: boolean,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const id = ++csvWorkerRequestId
    csvWorkerPending.set(id, { resolve, reject })
    const request: CsvWorkerRequest = { id, bytes, mode, delimiter, includeProperties }
    getCsvWorker().postMessage(request)
  })
}

export async function exportIfcCsv(request: CsvExportRequest): Promise<CsvExportResult> {
  const includeProperties = request.mode === 'entities' && request.includeProperties
  const source = await exportCsvOffMainThread(request.bytes, request.mode, request.delimiter, includeProperties)
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
  return `${base}-${mode}-${scope}.xls`
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

function xmlEscape(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** SpreadsheetML - a plain-text XML format Excel opens as a real table (real
 * columns/rows, not comma-separated text pretending to be one), without
 * needing a binary zip-based xlsx writer library. */
function tableToSpreadsheetXml(rows: string[][], sheetName: string): string {
  const body = rows
    .map((row, rowIndex) => {
      const cells = row
        .map((cell) => {
          const numeric = rowIndex > 0 && cell !== '' && Number.isFinite(Number(cell))
          const style = rowIndex === 0 ? ' ss:StyleID="Header"' : ''
          return `<Cell${style}><Data ss:Type="${numeric ? 'Number' : 'String'}">${xmlEscape(cell)}</Data></Cell>`
        })
        .join('')
      return `<Row>${cells}</Row>`
    })
    .join('\n')
  const safeName = sheetName.replace(/[\\/?*[\]:]/g, '_').slice(0, 31) || 'Sheet1'
  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="Header"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#1F4E79" ss:Pattern="Solid"/></Style>
 </Styles>
 <Worksheet ss:Name="${xmlEscape(safeName)}">
  <Table>
${body}
  </Table>
 </Worksheet>
</Workbook>`
}

/** Converts a generated CSV result into the bytes of a real Excel table. */
export function tableResultToXlsBytes(result: CsvExportResult, delimiter: CsvDelimiter, sheetName: string): Uint8Array {
  const rows = parseCsvRecords(result.text, delimiter)
  return new TextEncoder().encode(tableToSpreadsheetXml(rows, sheetName))
}

/**
 * Saves exported table bytes. On desktop this opens a native "Save As"
 * dialog and writes to the chosen path (unlike a browser download, which
 * always lands wherever the OS/browser sends downloads with no picker and no
 * confirmed path) - matching how "Export IFC" already behaves. Returns the
 * saved path on desktop, or null in the browser (blob download, no path to
 * report) or if the user cancelled the dialog.
 */
export async function saveExportedTable(fileName: string, bytes: Uint8Array): Promise<string | null> {
  if (isDesktopShell()) {
    const path = await saveFileDialog({
      title: 'Export table',
      defaultPath: fileName,
      filters: [{ name: 'Excel', extensions: ['xls'] }],
    })
    if (!path) return null
    await writeExportedFile(path, bytes)
    return path
  }
  const blob = new Blob([bytes.slice()], { type: 'application/vnd.ms-excel' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
  return null
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
