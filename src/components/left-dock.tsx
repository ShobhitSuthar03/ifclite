import { Filter, Layers, ListTree, Palette, BarChart3 } from 'lucide-react'
import { BreakdownPanel } from '@/components/breakdown-panel'
import { FilterBar } from '@/components/filter-bar'
import { LensPanel } from '@/components/lens-panel'
import { ReportsPanel } from '@/components/reports-panel'
import { PanelTabs } from '@/components/panel-tabs'
import { SpatialTree } from '@/components/spatial-tree'
import type { FilterOptions, GroupByField, MetricField, PropertyCatalogSet, ReportFilter, ReportTemplate } from '@/lib/bim-sql'
import type { IfcDataStore, SpatialTreeNode } from '@/lib/ifc-data'
import type { QuerySpec } from '@/lib/ifc-query'
import type { AutoColorSpec, Lens, LensEvaluationResult, LensOperator } from '@ifc-lite/lens'
import type { PropertyRef, PropertyTreeNode } from '@/lib/property-tree'

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
  filterReady: boolean
  filterHint?: string | null
  propertyCatalog: PropertyCatalogSet[]
  onSpecChange: (spec: QuerySpec) => void
  filterProperty: PropertyRef | null
  filterTree: PropertyTreeNode[]
  filterNodeKey: string | null
  onSelectFilterProperty: (ref: PropertyRef | null) => void
  onSelectFilterValue: (node: PropertyTreeNode | null) => void
  breakdownRules: PropertyRef[]
  breakdownTree: PropertyTreeNode[]
  breakdownNodeKey: string | null
  breakdownColorize: boolean
  onBreakdownRulesChange: (rules: PropertyRef[]) => void
  onSelectBreakdownNode: (node: PropertyTreeNode | null) => void
  onBreakdownColorizeChange: (colorize: boolean) => void
  lenses: Lens[]
  lensId: string | null
  lensResult: LensEvaluationResult | null
  lensLegend: Array<{ id: string; name: string; color: string; count: number }>
  lensReady: boolean
  lensHint?: string | null
  onLensSelect: (lens: Lens | null) => void
  onCreateAutoColorLens: (spec: AutoColorSpec, name: string) => void
  onCreatePropertyLens: (input: {
    propertySet: string
    propertyName: string
    operator: LensOperator
    propertyValue: string
    color: string
    kind: 'property' | 'quantity'
  }) => void
  onRemoveLens: (id: string) => void
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
  filterReady,
  filterHint,
  propertyCatalog,
  onSpecChange,
  filterProperty,
  filterTree,
  filterNodeKey,
  onSelectFilterProperty,
  onSelectFilterValue,
  breakdownRules,
  breakdownTree,
  breakdownNodeKey,
  breakdownColorize,
  onBreakdownRulesChange,
  onSelectBreakdownNode,
  onBreakdownColorizeChange,
  lenses,
  lensId,
  lensResult,
  lensLegend,
  lensReady,
  lensHint,
  onLensSelect,
  onCreateAutoColorLens,
  onCreatePropertyLens,
  onRemoveLens,
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
            ready={filterReady}
            hint={filterHint}
            catalog={propertyCatalog}
            rules={breakdownRules}
            tree={breakdownTree}
            selectedKey={breakdownNodeKey}
            colorize={breakdownColorize}
            onRulesChange={onBreakdownRulesChange}
            onSelectNode={onSelectBreakdownNode}
            onColorizeChange={onBreakdownColorizeChange}
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
          <LensPanel
            lenses={lenses}
            activeId={lensId}
            result={lensResult}
            legend={lensLegend}
            catalog={propertyCatalog}
            disabled={!lensReady}
            hint={lensHint}
            onSelect={onLensSelect}
            onCreateAutoColor={onCreateAutoColorLens}
            onCreatePropertyLens={onCreatePropertyLens}
            onRemove={onRemoveLens}
          />
        ) : (
          <FilterBar
            ready={filterReady}
            hint={filterHint}
            spatialRoot={root}
            catalog={propertyCatalog}
            spec={spec}
            selectedProperty={filterProperty}
            valueTree={filterTree}
            selectedKey={filterNodeKey}
            matchCount={matchCount}
            error={filterError}
            onChange={onSpecChange}
            onSelectProperty={onSelectFilterProperty}
            onSelectValue={onSelectFilterValue}
          />
        )}
      </div>
    </aside>
  )
}
