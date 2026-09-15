import type { QuerySpec } from '@/lib/ifc-query'
import type { DisplayMode } from '@/lib/view-visibility'
import type { BreakdownMode } from '@/lib/breakdown'
import type { LeftTab } from '@/components/left-dock'
import type { RightTab } from '@/components/right-dock'
import type {
  GroupByField,
  MetricField,
  ReportFilter,
  ReportTemplate,
} from '@/lib/bim-sql'
import { EMPTY_QUERY } from '@/lib/ifc-query'
import { EMPTY_REPORT_FILTER } from '@/lib/bim-sql'
import type { QuantityResult } from '@/lib/geometry-qto'

export type MutationPatch = {
  expressId: number
  kind: 'attribute' | 'property'
  name: string
  value: string
  pset?: string
}

export type ProjectSession = {
  version: 1
  cacheKey: string
  fileName: string
  selectedIds: number[]
  hiddenIds: number[]
  focusIds: number[]
  treeScopeIds: number[] | null
  displayMode: DisplayMode
  leftTab: LeftTab
  rightTab: RightTab
  spec: QuerySpec
  breakdownMode: BreakdownMode
  reportTemplate: ReportTemplate
  reportGroupBy: GroupByField
  reportMetrics: MetricField[]
  reportFilter: ReportFilter
  followViewer: boolean
  mutations: MutationPatch[]
  quantities: QuantityResult | null
}

export function emptySession(cacheKey = '', fileName = ''): ProjectSession {
  return {
    version: 1,
    cacheKey,
    fileName,
    selectedIds: [],
    hiddenIds: [],
    focusIds: [],
    treeScopeIds: null,
    displayMode: 'all',
    leftTab: 'tree',
    rightTab: 'properties',
    spec: EMPTY_QUERY,
    breakdownMode: 'type',
    reportTemplate: 'qto',
    reportGroupBy: 'category',
    reportMetrics: ['count', 'volume', 'area', 'cost'],
    reportFilter: { ...EMPTY_REPORT_FILTER },
    followViewer: true,
    mutations: [],
    quantities: null,
  }
}

/** Drop overlay triangle buffers so session.json stays small. Metrics still restore. */
export function persistableQuantities(result: QuantityResult | null): QuantityResult | null {
  if (!result) return null
  return {
    ...result,
    elements: result.elements.map((element) => ({
      ...element,
      faces: element.faces.map((face) => ({ ...face, positions: [] })),
    })),
  }
}

export function parseSessionJson(json: string | null | undefined): ProjectSession | null {
  if (!json) return null
  try {
    const parsed = JSON.parse(json) as ProjectSession
    if (parsed?.version !== 1) return null
    return parsed
  } catch {
    return null
  }
}
