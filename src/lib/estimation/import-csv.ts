import {
  assertImportSize,
  boqFromImportRows,
  decodeImportBytes,
  fileStem,
  type BoqImportResult,
  type BoqImportRow,
} from '@/lib/estimation/import-table'
import type { CostAssembly } from '@/lib/cost-assembly/types'
import type { BoqKind } from '@/lib/estimation/types'

const KIND_ALIASES = new Set(['kind', 'row kind', 'type', 'row type'])
const CODE_ALIASES = new Set(['code', 'key', 'item code', 'wbs code'])
const PARENT_ALIASES = new Set(['parent_code', 'parent', 'parent code', 'parent key'])
const NAME_ALIASES = new Set(['name', 'desc', 'description', 'title'])
const ASSEMBLY_ALIASES = new Set(['assembly_code', 'assembly', 'matchkey', 'match_key', 'match key'])
const QTY_TYPE_ALIASES = new Set(['qty_type', 'qto', 'qto_type', 'qto type'])
const QTY_UOM_ALIASES = new Set(['qty_uom', 'uom', 'unit'])
const QTY2_NAME_ALIASES = new Set(['qty2_name', 'extra_name', 'qto2_name'])
const QTY2_TYPE_ALIASES = new Set(['qty2_type', 'extra_type', 'qto2_type'])
const QTY2_UOM_ALIASES = new Set(['qty2_uom', 'extra_uom', 'qto2_uom'])
const WBS_ALIASES = new Set(['wbs', 'wbs_id', 'wbs id'])
const NOTES_ALIASES = new Set(['notes', 'note', 'comment'])
const MATCH_PROP_ALIASES = new Set(['match_property', 'link property', 'ifc property'])
const MATCH_VALUE_ALIASES = new Set(['match_value', 'property value', 'link value'])

function headerKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function pickIndex(headers: string[], aliases: Set<string>): number {
  return headers.findIndex((header) => aliases.has(header))
}

function detectDelimiter(headerLine: string): ',' | ';' {
  const comma = (headerLine.match(/,/g) ?? []).length
  const semi = (headerLine.match(/;/g) ?? []).length
  return semi > comma ? ';' : ','
}

function splitCsvLine(line: string, delimiter: ',' | ';'): string[] {
  const out: string[] = []
  let current = ''
  let quoted = false
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"'
        i += 1
      } else if (ch === '"') quoted = false
      else current += ch
    } else if (ch === '"') quoted = true
    else if (ch === delimiter) {
      out.push(current)
      current = ''
    } else current += ch
  }
  out.push(current)
  return out.map((cell) => cell.trim())
}

function parseKind(raw: string): BoqKind | '' {
  const value = raw.trim().toLowerCase()
  if (value === 'heading' || value === 'group' || value === 'chapter' || value === 'header') return 'heading'
  if (value === 'item' || value === 'line' || value === 'leaf') return 'item'
  return ''
}

export function parseBoqCsv(
  bytes: Uint8Array,
  fileName: string,
  assemblies?: Array<Pick<CostAssembly, 'id' | 'code'>>,
): BoqImportResult {
  assertImportSize(bytes, fileName)
  const text = decodeImportBytes(bytes).replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = text.split('\n').filter((line) => line.trim().length > 0)
  if (lines.length === 0) throw new Error(`${fileName} is empty`)
  const delimiter = detectDelimiter(lines[0])
  const headers = splitCsvLine(lines[0], delimiter).map(headerKey)
  const kindAt = pickIndex(headers, KIND_ALIASES)
  const codeAt = pickIndex(headers, CODE_ALIASES)
  const parentAt = pickIndex(headers, PARENT_ALIASES)
  const nameAt = pickIndex(headers, NAME_ALIASES)
  const assemblyAt = pickIndex(headers, ASSEMBLY_ALIASES)
  const qtyTypeAt = pickIndex(headers, QTY_TYPE_ALIASES)
  const qtyUomAt = pickIndex(headers, QTY_UOM_ALIASES)
  const qty2NameAt = pickIndex(headers, QTY2_NAME_ALIASES)
  const qty2TypeAt = pickIndex(headers, QTY2_TYPE_ALIASES)
  const qty2UomAt = pickIndex(headers, QTY2_UOM_ALIASES)
  const wbsAt = pickIndex(headers, WBS_ALIASES)
  const notesAt = pickIndex(headers, NOTES_ALIASES)
  const matchPropAt = pickIndex(headers, MATCH_PROP_ALIASES)
  const matchValueAt = pickIndex(headers, MATCH_VALUE_ALIASES)
  if (codeAt < 0 && nameAt < 0) {
    throw new Error(`${fileName} needs a code or name column`)
  }
  const cell = (cols: string[], index: number) => (index >= 0 ? (cols[index] ?? '') : '')
  const rows: BoqImportRow[] = []
  for (let i = 1; i < lines.length; i += 1) {
    const cols = splitCsvLine(lines[i], delimiter)
    const inferred = parseKind(cell(cols, kindAt))
    rows.push({
      kind: inferred,
      code: cell(cols, codeAt),
      parentCode: cell(cols, parentAt),
      name: cell(cols, nameAt),
      assemblyCode: cell(cols, assemblyAt),
      qtyType: cell(cols, qtyTypeAt),
      qtyUom: cell(cols, qtyUomAt),
      qty2Name: cell(cols, qty2NameAt),
      qty2Type: cell(cols, qty2TypeAt),
      qty2Uom: cell(cols, qty2UomAt),
      wbs: cell(cols, wbsAt),
      notes: cell(cols, notesAt),
      matchProperty: cell(cols, matchPropAt),
      matchValue: cell(cols, matchValueAt),
    })
  }
  return boqFromImportRows(rows, { name: fileStem(fileName), assemblies })
}
