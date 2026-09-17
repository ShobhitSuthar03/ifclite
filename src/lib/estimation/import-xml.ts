import { child, children, parseXmlTree, textOf, type XmlEl } from '@/lib/cost-assembly/xml'
import type { CostAssembly } from '@/lib/cost-assembly/types'
import {
  assertImportSize,
  boqFromImportRows,
  decodeImportBytes,
  fileStem,
  parseQtoFormula,
  type BoqImportResult,
  type BoqImportRow,
} from '@/lib/estimation/import-table'

function firstElementItem(root: XmlEl): XmlEl | null {
  if (root.tag === 'ElementItem') return root
  return root.children.find((node) => node.tag === 'ElementItem') ?? null
}

function formulasOf(el: XmlEl): Array<{ name: string; formula: string }> {
  const type = child(el, 'Type')
  const data = type ? child(type, 'CompositeLinkExt') : undefined
  const items = data ? child(data, 'ItemData') : undefined
  if (!items) return []
  return children(items, 'Formula').map((node) => ({
    name: node.attrs.ID ?? '',
    formula: node.text,
  }))
}

function flattenElement(el: XmlEl, parentCode: string, out: BoqImportRow[]) {
  const code = textOf(el, 'Key').trim()
  const name = textOf(el, 'Desc').trim()
  const assemblyCode = textOf(el, 'MatchKey').trim()
  const formulas = formulasOf(el)
  const childWrap = child(el, 'Childs')
  const nested = childWrap ? children(childWrap, 'ElementItem') : []
  const isRootPlaceholder = (code === '-' || code === '') && nested.length > 0
  if (isRootPlaceholder) {
    for (const childEl of nested) flattenElement(childEl, '', out)
    return
  }
  const primary = formulas[0] ? parseQtoFormula(formulas[0].formula) : null
  const extra = formulas[1] ? parseQtoFormula(formulas[1].formula) : null
  const heading = nested.length > 0 || (!primary && !assemblyCode)
  out.push({
    kind: heading ? 'heading' : 'item',
    code,
    parentCode,
    name,
    assemblyCode,
    qtyType: primary?.type ?? '',
    qtyUom: primary?.uom ?? '',
    qty2Name: formulas[1]?.name ?? '',
    qty2Type: extra?.type ?? '',
    qty2Uom: extra?.uom ?? '',
    wbs: '',
    notes: '',
    matchProperty: '',
    matchValue: assemblyCode,
  })
  for (const childEl of nested) flattenElement(childEl, code, out)
}

export function parseBoqXml(
  bytes: Uint8Array,
  fileName: string,
  assemblies?: Array<Pick<CostAssembly, 'id' | 'code'>>,
): BoqImportResult {
  assertImportSize(bytes, fileName)
  const xml = decodeImportBytes(bytes)
  const trimmed = xml.trim()
  if (!trimmed.startsWith('<')) throw new Error(`${fileName} is not XML`)
  if (/NameAssembly|CostAssembly/i.test(trimmed.slice(0, 400))) {
    throw new Error(`${fileName} looks like a Cost Assembly catalog. Use Assemblies → Open, not BOQ import.`)
  }
  let root: XmlEl
  try {
    root = parseXmlTree(xml)
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught)
    throw new Error(`${fileName} is not readable XML: ${message}`)
  }
  const element = firstElementItem(root)
  if (!element) {
    throw new Error(`${fileName} is not an iTWO Element Planning export (missing ElementItem).`)
  }
  const rows: BoqImportRow[] = []
  flattenElement(element, '', rows)
  if (rows.length === 0) throw new Error(`${fileName} has no BOQ lines`)
  return boqFromImportRows(rows, { name: fileStem(fileName), assemblies })
}
