export type LocalizedText = {
  language: string
  value: string
}

export type CostKind = 'labor' | 'material' | 'equipment' | 'subcontractor' | 'other'

export type CatalogAssign = {
  name: string
  code: string
}

export type CatalogAssignments = {
  cgr0Element?: string
  assigns: CatalogAssign[]
}

export type CostComponent = {
  name: string
  description: LocalizedText[]
  extraDescription: LocalizedText[]
  disabled: boolean
  currency: string
  quantity: number
  quantityDetail?: string
  factor: number
  factorIsPerformanceFactor: boolean
  factorDetail?: string
  unitRate: number
  costFactor: number
  cFactor: number
  qFactor: number
  flagFixedBudget: boolean
  budgetUomItem: boolean
  budget: number
  comment?: string
  catalog?: CatalogAssignments
  kind: CostKind
  amount: number
}

export type AssemblyParameter = {
  code: string
  description: string
  unit?: string
  type: string
  value?: string
  userdef1?: string
  userdef2?: string
}

export type AssemblyVariable = {
  key: string
  type: string
  description: string
  value: string
  detail: string
  unit?: string
}

export type EstimateText = {
  text: LocalizedText[]
  intern: boolean
}

export type EstimateDetails = {
  subItems: SubItem[]
  components: CostComponent[]
  texts: EstimateText[]
}

export type SubItem = {
  number: string
  quantity: number
  quantityDetail?: string
  factor: number
  factorIsPerformanceFactor: boolean
  costFactor: number
  flagFixedBudget: boolean
  budgetUomItem: boolean
  budget: number
  text: LocalizedText[]
  unitOfMeasure?: string
  itemNo: string
  lumpSum: number
  lumpSumAbs: number
  disabled: boolean
  compressed: boolean
  reserve: number
  phase: string
  estimateStatus: string
  details: EstimateDetails
  variables: AssemblyVariable[]
  parameters: AssemblyParameter[]
  catalog?: CatalogAssignments
}

export type CostAssembly = {
  id: string
  code: string
  description: LocalizedText[]
  uom: string
  currency: string
  isAssembly: boolean
  isPlantOrEquip: boolean
  isDiff: boolean
  isRefItem: boolean
  lumpSum: number
  breakUp: boolean
  costs: number
  hours: number
  parameters: AssemblyParameter[]
  details: EstimateDetails
  category: string
  path: string[]
  labor: number
  material: number
  equipment: number
  subcontractor: number
  other: number
}

export type AssemblyDivisionNode = {
  id: string
  code: string
  description: LocalizedText[]
  children: AssemblyDivisionNode[]
  assemblies: CostAssembly[]
}

export type CostAssemblyCatalog = {
  projectName: string
  projectDescription: string
  cgrCatalogs: { slot: string; name: string }[]
  catalogName: string
  catalogDescription: string
  catalogType: string
  root: AssemblyDivisionNode[]
  assemblies: CostAssembly[]
  sourcePath: string
  sourceName: string
  modifiedMs: number
  loadedAt: number
}

export function displayText(items: LocalizedText[] | undefined, fallback = ''): string {
  if (!items || items.length === 0) return fallback
  const english = items.find((item) => item.language.toLowerCase() === 'en')
  return (english ?? items[0]).value
}

export function englishHint(items: LocalizedText[] | undefined): string {
  const raw = displayText(items)
  const parts = raw.split('|')
  return (parts[1] ?? parts[0] ?? '').trim()
}
