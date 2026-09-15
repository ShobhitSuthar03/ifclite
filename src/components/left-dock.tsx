import { Filter, Layers, ListTree, Palette, BarChart3 } from 'lucide-react'
import { BreakdownPanel } from '@/components/breakdown-panel'
import { FilterBar } from '@/components/filter-bar'
import { LensPanel } from '@/components/lens-panel'
import { ReportsPanel } from '@/components/reports-panel'
import { PanelTabs } from '@/components/panel-tabs'
import { SpatialTree } from '@/components/spatial-tree'
import type { BreakdownGroup, BreakdownMode } from '@/lib/breakdown'
import type { IfcDataStore, SpatialTreeNode } from '@/lib/ifc-data'
import type { QuerySpec } from '@/lib/ifc-query'
import type { Lens, LensEvaluationResult } from '@ifc-lite/lens'
import type { FilterOptions, GroupByField, MetricField, ReportFilter, ReportTemplate } from '@/lib/bim-sql'

export type LeftTab = 'tree' | 'breakdown' | 'filters' | 'lens' | 'reports'

type LeftDockProps = {
  tab: LeftTab
  onTabChange: (tab: LeftTab) => void
  root: SpatialTreeNode | null
  store: IfcDataStore | null
  selectedId: number | null
  selectedIds: Set<number>
  isolatedIds: Set<number> | null
  parsing: boolean
  onSelect: (expressId: number, additive?: boolean) => void
  onSelectScope: (ids: number[], additive?: boolean) => void
  spec: QuerySpec
  matchCount: number | null
  filterError: string | null
  onSpecChange: (spec: QuerySpec) => void
  groups: BreakdownGroup[]
  breakdownMode: BreakdownMode
  queryActive: boolean
  selectedKey: string | null
  onModeChange: (mode: BreakdownMode) => void
  onSelectGroup: (group: BreakdownGroup) => void
  onSelectId: (expressId: number, additive?: boolean) => void
  lensId: string | null
  lensResult: LensEvaluationResult | null
  onLensSelect: (lens: Lens | null) => void
  reportReady: boolean
  reportBusy: boolean
  reportTemplate: ReportTemplate
  reportGroupBy: GroupByField
  reportMetrics: MetricField[]
  reportFilter: ReportFilter
  reportOptions: FilterOptions | null
  followViewer: boolean
  onReportTemplate: (template: ReportTemplate) => void
  onReportGroupBy: (groupBy: GroupByField) => void
  onReportMetrics: (metrics: MetricField[]) => void
  onReportFilter: (filter: ReportFilter) => void
  onFollowViewer: (follow: boolean) => void
  showTabs?: boolean
}

export function LeftDock({
  tab,
  onTabChange,
  root,
  store,
  selectedId,
  selectedIds,
  isolatedIds,
  parsing,
  onSelect,
  onSelectScope,
  spec,
  matchCount,
  filterError,
  onSpecChange,
  groups,
  breakdownMode,
  queryActive,
  selectedKey,
  onModeChange,
  onSelectGroup,
  onSelectId,
  lensId,
  lensResult,
  onLensSelect,
  reportReady,
  reportBusy,
  reportTemplate,
  reportGroupBy,
  reportMetrics,
  reportFilter,
  reportOptions,
  followViewer,
  onReportTemplate,
  onReportGroupBy,
  onReportMetrics,
  onReportFilter,
  onFollowViewer,
  showTabs = true,
}: LeftDockProps) {
  return (
    <aside className="flex h-full min-h-0 w-full flex-col bg-card">
      {showTabs && (
        <PanelTabs
          value={tab}
          onChange={onTabChange}
          tabs={[
            { id: 'tree', label: 'Tree', icon: <ListTree className="h-3.5 w-3.5" /> },
            { id: 'breakdown', label: 'Breakdown', icon: <Layers className="h-3.5 w-3.5" /> },
            { id: 'filters', label: 'Filters', icon: <Filter className="h-3.5 w-3.5" /> },
            { id: 'lens', label: 'Lens', icon: <Palette className="h-3.5 w-3.5" /> },
            { id: 'reports', label: 'Reports', icon: <BarChart3 className="h-3.5 w-3.5" /> },
          ]}
        />
      )}
      <div className="min-h-0 flex-1">
        {tab === 'tree' ? (
          <SpatialTree
            root={root}
            store={store}
            selectedId={selectedId}
            selectedIds={selectedIds}
            isolatedIds={isolatedIds}
            parsing={parsing}
            embedded
            onSelect={onSelect}
            onSelectScope={onSelectScope}
          />
        ) : tab === 'breakdown' ? (
          <BreakdownPanel
            groups={groups}
            mode={breakdownMode}
            active={queryActive}
            selectedKey={selectedKey}
            onModeChange={onModeChange}
            onSelectGroup={onSelectGroup}
            selectedIds={selectedIds}
            onSelectId={onSelectId}
          />
        ) : tab === 'reports' ? (
          <ReportsPanel
            ready={reportReady}
            busy={reportBusy}
            template={reportTemplate}
            groupBy={reportGroupBy}
            metrics={reportMetrics}
            filter={reportFilter}
            options={reportOptions}
            followViewer={followViewer}
            onTemplate={onReportTemplate}
            onGroupBy={onReportGroupBy}
            onMetrics={onReportMetrics}
            onFilter={onReportFilter}
            onFollowViewer={onFollowViewer}
          />
        ) : tab === 'lens' ? (
          <LensPanel activeId={lensId} result={lensResult} disabled={!store} onSelect={onLensSelect} />
        ) : (
          <FilterBar store={store} spec={spec} matchCount={matchCount} error={filterError} onChange={onSpecChange} />
        )}
      </div>
    </aside>
  )
}
