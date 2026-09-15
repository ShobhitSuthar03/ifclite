export type SqlValue = string | number | null

export type ReportTemplate = 'qto' | 'cost' | 'qa' | 'progress' | 'custom'

export type GroupByField = 'category' | 'storey' | 'material' | 'cost_code' | 'phase' | 'ifc_type' | 'status'

export type MetricField = 'count' | 'volume' | 'area' | 'length' | 'weight' | 'cost'

export type ReportFilter = {
  storey: string | null
  category: string | null
  costCode: string | null
  phase: string | null
  status: string | null
}

export const EMPTY_REPORT_FILTER: ReportFilter = {
  storey: null,
  category: null,
  costCode: null,
  phase: null,
  status: null,
}

export type ReportKpi = {
  label: string
  value: string
  hint?: string
  tone?: 'ok' | 'warn' | 'muted'
}

export type ReportRow = {
  key: string
  label: string
  values: Record<string, number | string>
}

export type ReportResult = {
  template: ReportTemplate
  title: string
  groupBy: GroupByField
  columns: Array<{ key: string; label: string; kind: 'text' | 'number' | 'percent' }>
  kpis: ReportKpi[]
  rows: ReportRow[]
  elementCount: number
}

export type FilterOptions = {
  storeys: string[]
  categories: string[]
  costCodes: string[]
  phases: string[]
  statuses: string[]
}

export type ElementRecord = {
  expressId: number
  globalId: string
  ifcType: string
  category: string
  name: string
  description: string
  objectType: string
  tag: string
  storeyId: number | null
  storeyName: string
  zoneName: string
  material: string
  costCode: string
  boqItem: string
  phase: string
  status: string
  volume: number
  area: number
  length: number
  width: number
  height: number
  weight: number
  unitCost: number
  totalCost: number
  targetCost: number
  fireRating: string
  properties: Array<{ pset: string; name: string; value: string; numeric: number | null }>
  quantities: Array<{ qset: string; name: string; value: number; unit: string }>
}
