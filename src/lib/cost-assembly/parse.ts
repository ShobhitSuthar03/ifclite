import { child, children, flagOf, numberOf, parseXmlTree, textOf, type XmlEl } from '@/lib/cost-assembly/xml'
import type {
  AssemblyDivisionNode,
  AssemblyParameter,
  AssemblyVariable,
  CatalogAssignments,
  CostAssembly,
  CostAssemblyCatalog,
  CostComponent,
  CostKind,
  EstimateDetails,
  EstimateText,
  LocalizedText,
  SubItem,
} from '@/lib/cost-assembly/types'

export function costKindFromCode(code: string): CostKind {
  const prefix = code.trim().slice(0, 2).toUpperCase()
  if (prefix === 'LO') return 'labor'
  if (prefix === 'MA') return 'material'
  if (prefix === 'ME') return 'equipment'
  if (prefix === 'OA' || prefix === 'SU' || prefix === 'SC') return 'subcontractor'
  return 'other'
}

export function componentAmount(row: {
  quantity: number
  factor: number
  unitRate: number
  costFactor: number
  cFactor: number
  qFactor: number
}): number {
  return row.quantity * row.factor * row.unitRate * row.costFactor * row.cFactor * row.qFactor
}

function localized(el: XmlEl | undefined): LocalizedText[] {
  if (!el) return []
  return children(el, 'txt').map((node) => ({
    language: node.attrs.language ?? '',
    value: node.text,
  }))
}

function catalogAssignments(el: XmlEl | undefined): CatalogAssignments | undefined {
  if (!el) return undefined
  const assigns = children(el, 'CtlgAssign').map((node) => ({
    name: node.attrs.Name ?? '',
    code: textOf(node, 'CtlgCode'),
  }))
  const cgr0Element = textOf(el, 'CGR0Element') || undefined
  if (!cgr0Element && assigns.length === 0) return undefined
  return { cgr0Element, assigns }
}

function parametersOf(el: XmlEl | undefined): AssemblyParameter[] {
  if (!el) return []
  return children(el, 'Parameter').map((node) => ({
    code: textOf(node, 'CharacteristicObjectCode'),
    description: textOf(node, 'CharacteristicDescription'),
    unit: textOf(node, 'CharacteristicUnit') || undefined,
    type: textOf(node, 'CharacteristicType'),
    value: textOf(node, 'CharacteristicValue') || undefined,
    userdef1: textOf(node, 'CharacteristicUserdef1') || undefined,
    userdef2: textOf(node, 'CharacteristicUserdef2') || undefined,
  }))
}

function variablesOf(el: XmlEl | undefined): AssemblyVariable[] {
  if (!el) return []
  return children(el, 'PropObj').map((node) => {
    const prop = child(node, 'Prop')
    const item = child(node, 'PropItem')
    return {
      key: prop ? textOf(prop, 'Key') : '',
      type: prop ? textOf(prop, 'Type') : '',
      description: prop ? textOf(prop, 'Desc') : '',
      value: item ? textOf(item, 'Value') : '',
      detail: item ? textOf(item, 'Detail') : '',
      unit: textOf(node, 'Unit') || undefined,
    }
  })
}

function costComponent(el: XmlEl): CostComponent {
  const quantity = numberOf(el, 'Quantity')
  const factor = numberOf(el, 'Factor', 1)
  const unitRate = numberOf(el, 'URValue')
  const costFactor = numberOf(el, 'CostFactor', 1)
  const cFactor = numberOf(el, 'CFactorCoC', 1)
  const qFactor = numberOf(el, 'QFactorCoC', 1)
  const name = textOf(el, 'NameCoC')
  return {
    name,
    description: localized(child(el, 'DescrCoC')),
    extraDescription: localized(child(el, 'Description')),
    disabled: flagOf(el, 'SItemDisabled'),
    currency: textOf(el, 'CURCoC') || 'EUR',
    quantity,
    quantityDetail: textOf(el, 'QuantityDetail') || undefined,
    factor,
    factorIsPerformanceFactor: flagOf(el, 'FactorIsPerformanceFactor'),
    factorDetail: textOf(el, 'FactorDetail') || undefined,
    unitRate,
    costFactor,
    cFactor,
    qFactor,
    flagFixedBudget: flagOf(el, 'FlagFixedBudget'),
    budgetUomItem: flagOf(el, 'BudgetUomItem'),
    budget: numberOf(el, 'Budget'),
    comment: textOf(el, 'Comment') || undefined,
    catalog: catalogAssignments(child(el, 'CatalogAssignments')),
    kind: costKindFromCode(name),
    amount: componentAmount({ quantity, factor, unitRate, costFactor, cFactor, qFactor }),
  }
}

function estimateDetails(el: XmlEl | undefined): EstimateDetails {
  if (!el) return { subItems: [], components: [], texts: [] }
  const texts: EstimateText[] = children(el, 'EstTextElement').map((node) => ({
    text: localized(child(node, 'Text')),
    intern: flagOf(node, 'BoolIntern'),
  }))
  return {
    subItems: children(el, 'SubItem').map(subItem),
    components: children(el, 'CoCDetail').map(costComponent),
    texts,
  }
}

function subItem(el: XmlEl): SubItem {
  return {
    number: textOf(el, 'SubitemNumber') || textOf(el, 'SItemNo'),
    quantity: numberOf(el, 'Quantity'),
    quantityDetail: textOf(el, 'QuantityDetail') || undefined,
    factor: numberOf(el, 'Factor', 1),
    factorIsPerformanceFactor: flagOf(el, 'FactorIsPerformanceFactor'),
    costFactor: numberOf(el, 'CostFactor', 1),
    flagFixedBudget: flagOf(el, 'FlagFixedBudget'),
    budgetUomItem: flagOf(el, 'BudgetUomItem'),
    budget: numberOf(el, 'Budget'),
    text: localized(child(el, 'Text')),
    unitOfMeasure: textOf(el, 'UnitOfMeasure') || undefined,
    itemNo: textOf(el, 'SItemNo'),
    lumpSum: numberOf(el, 'SItemLSum'),
    lumpSumAbs: numberOf(el, 'SItemLSumAbs'),
    disabled: flagOf(el, 'SItemDisabled'),
    compressed: flagOf(el, 'Compressed'),
    reserve: numberOf(el, 'SItemReserve'),
    phase: textOf(el, 'SPPhase'),
    estimateStatus: textOf(el, 'EstimateStatus'),
    details: estimateDetails(child(el, 'EstDetails')),
    variables: variablesOf(child(el, 'Vars')),
    parameters: parametersOf(child(el, 'Parameters')),
    catalog: catalogAssignments(child(el, 'CatalogAssignments')),
  }
}

function kindTotals(details: EstimateDetails): Pick<CostAssembly, 'labor' | 'material' | 'equipment' | 'subcontractor' | 'other'> {
  const totals = { labor: 0, material: 0, equipment: 0, subcontractor: 0, other: 0 }
  const visit = (node: EstimateDetails) => {
    for (const component of node.components) {
      if (component.disabled) continue
      totals[component.kind] += component.amount
    }
    for (const item of node.subItems) {
      if (item.disabled) continue
      visit(item.details)
    }
  }
  visit(details)
  return totals
}

function assemblyOf(el: XmlEl, path: string[]): CostAssembly {
  const code = textOf(el, 'NameAssembly')
  const details = estimateDetails(child(el, 'EstDetails'))
  const category = path[path.length - 1] ?? ''
  return {
    id: [...path, code].join('/'),
    code,
    description: localized(child(el, 'DescrAssembly')),
    uom: textOf(el, 'AssemblyUoM'),
    currency: textOf(el, 'AssemblyCurrency') || 'EUR',
    isAssembly: flagOf(el, 'IsAssembly'),
    isPlantOrEquip: flagOf(el, 'IsPlantOrEquipAssembly'),
    isDiff: flagOf(el, 'IsDiffAssembly'),
    isRefItem: flagOf(el, 'IsRefItemAssembly'),
    lumpSum: numberOf(el, 'LSumAssembly'),
    breakUp: flagOf(el, 'BreakUp'),
    costs: numberOf(el, 'Costs'),
    hours: numberOf(el, 'Hours'),
    parameters: parametersOf(child(el, 'Parameters')),
    details,
    category,
    path,
    ...kindTotals(details),
  }
}

function divisionOf(el: XmlEl, path: string[]): AssemblyDivisionNode {
  const code = textOf(el, 'NameAssembly')
  const nextPath = [...path, code]
  const description = localized(child(el, 'DescrAssembly'))
  return {
    id: nextPath.join('/'),
    code,
    description,
    children: children(el, 'AssemblyDivision').map((node) => divisionOf(node, nextPath)),
    assemblies: children(el, 'Assembly').map((node) => assemblyOf(node, nextPath)),
  }
}

function flatten(nodes: AssemblyDivisionNode[]): CostAssembly[] {
  const out: CostAssembly[] = []
  const walk = (node: AssemblyDivisionNode) => {
    out.push(...node.assemblies)
    for (const childNode of node.children) walk(childNode)
  }
  for (const node of nodes) walk(node)
  return out
}

export function parseCostAssemblyXml(
  xml: string,
  source: { path: string; name: string; modifiedMs?: number },
): CostAssemblyCatalog {
  const root = parseXmlTree(xml)
  if (root.tag !== 'AssemblyCatalogRoot') {
    throw new Error(`Expected AssemblyCatalogRoot, got <${root.tag}>`)
  }
  const project = child(root, 'PrjInfo')
  const cgr = project ? child(project, 'CGRCatalog') : undefined
  const catalog = child(root, 'AssemblyCatalog')
  if (!catalog) throw new Error('XML is missing AssemblyCatalog')
  const rootDivisions = children(catalog, 'AssemblyDivision').map((node) => divisionOf(node, []))
  return {
    projectName: project ? textOf(project, 'NamePrj') : '',
    projectDescription: project ? textOf(project, 'DescrPrj') : '',
    cgrCatalogs: cgr
      ? cgr.children
          .filter((node) => node.tag.startsWith('CGRCatalog'))
          .map((node) => ({ slot: node.tag, name: node.text }))
      : [],
    catalogName: textOf(catalog, 'CatalogName'),
    catalogDescription: textOf(catalog, 'CatalogDescription'),
    catalogType: textOf(catalog, 'CatalogType'),
    root: rootDivisions,
    assemblies: flatten(rootDivisions),
    sourcePath: source.path,
    sourceName: source.name,
    modifiedMs: source.modifiedMs ?? 0,
    loadedAt: Date.now(),
  }
}

export function parseCostAssemblyBytes(
  bytes: Uint8Array,
  source: { path: string; name: string; modifiedMs?: number },
): CostAssemblyCatalog {
  if (bytes.byteLength === 0) throw new Error(`${source.name} is empty`)
  const xml = new TextDecoder('utf-8').decode(bytes)
  if (!xml.trim()) throw new Error(`${source.name} is empty`)
  try {
    return parseCostAssemblyXml(xml, source)
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught)
    throw new Error(`${source.name} is not a cost assembly catalog: ${message}`)
  }
}
