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
import { parsePropertyRefs, type PropertyRef } from '@/lib/property-tree'
import { parseSavedViews, type SavedView } from '@/lib/saved-views'
import { parseEstimation, emptyEstimation, type EstimationDoc } from '@/lib/estimation'

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
  filterRules: PropertyRef[]
  reportTemplate: ReportTemplate
  reportGroupBy: GroupByField
  reportMetrics: MetricField[]
  reportFilter: ReportFilter
  followViewer: boolean
  mutations: MutationPatch[]
  quantities: QuantityResult | null
  savedViews: SavedView[]
  estimation: EstimationDoc
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
    filterRules: [],
    reportTemplate: 'qto',
    reportGroupBy: 'category',
    reportMetrics: ['count', 'volume', 'area', 'cost'],
    reportFilter: { ...EMPTY_REPORT_FILTER },
    followViewer: true,
    mutations: [],
    quantities: null,
    savedViews: [],
    estimation: emptyEstimation(),
  }
}

/** Keep quantity totals; drop per-face data so session writes stay cheap. */
export function persistableQuantities(result: QuantityResult | null): QuantityResult | null {
  if (!result) return null
  return {
    ...result,
    elements: result.elements.map((element) => ({
      ...element,
      faces: [],
    })),
  }
}

export function parseSessionJson(json: string | null | undefined): ProjectSession | null {
  if (!json) return null
  try {
    const parsed = JSON.parse(json) as ProjectSession
    if (parsed?.version !== 1) return null
    const rawTab = parsed.leftTab as string
    const leftTab =
      rawTab === 'breakdown' || rawTab === 'lens'
        ? 'filters'
        : rawTab === 'tree' || rawTab === 'filters' || rawTab === 'reports' || rawTab === 'views'
          ? rawTab
          : 'tree'
    return {
      ...parsed,
      leftTab,
      filterRules: parsePropertyRefs(parsed.filterRules),
      savedViews: parseSavedViews((parsed as { savedViews?: unknown }).savedViews),
      estimation: parseEstimation((parsed as { estimation?: unknown }).estimation),
    }
  } catch {
    return null
  }
}
