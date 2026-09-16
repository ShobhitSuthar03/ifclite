import { Filter, ListTree, BarChart3, Layers } from 'lucide-react'
import { FilterBar } from '@/components/filter-bar'
import { ReportsPanel } from '@/components/reports-panel'
import { ViewsPanel } from '@/components/views-panel'
import { PanelTabs } from '@/components/panel-tabs'
import { SpatialTree } from '@/components/spatial-tree'
import type { FilterOptions, GroupByField, MetricField, PropertyCatalogSet, ReportFilter, ReportTemplate } from '@/lib/bim-sql'
import type { IfcDataStore, SpatialTreeNode } from '@/lib/ifc-data'
import type { QuerySpec } from '@/lib/ifc-query'
import { propertySelectionLabel, unionPropertyNodeIds, type PropertyRef, type PropertyTreeNode } from '@/lib/property-tree'
import type { SavedView } from '@/lib/saved-views'

export type LeftTab = 'tree' | 'filters' | 'reports' | 'views'

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
  filterRules: PropertyRef[]
  filterTree: PropertyTreeNode[]
  filterNodeKeys: string[]
  onFilterRulesChange: (rules: PropertyRef[]) => void
  onSelectFilterValue: (node: PropertyTreeNode | null, additive?: boolean) => void
  filterColorize: boolean
  onFilterColorizeChange: (colorize: boolean) => void
  reportReady: boolean
  reportBusy: boolean
  reportProgress?: { done: number; total: number } | null
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
  savedViews: SavedView[]
  activeViewId: string | null
  viewExportBusy?: boolean
  exportingViewId?: string | null
  onSaveView: (name: string) => void
  onShowView: (view: SavedView) => void
  onUpdateView: (view: SavedView) => void
  onExportView: (view: SavedView) => void
  onDeleteView: (view: SavedView) => void
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
  filterRules,
  filterTree,
  filterNodeKeys,
  onFilterRulesChange,
  onSelectFilterValue,
  filterColorize,
  onFilterColorizeChange,
  reportReady,
  reportBusy,
  reportProgress,
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
  savedViews,
  activeViewId,
  viewExportBusy = false,
  exportingViewId = null,
  onSaveView,
  onShowView,
  onUpdateView,
  onExportView,
  onDeleteView,
  showTabs = true,
}: LeftDockProps) {
  const propertyIds = unionPropertyNodeIds(filterTree, filterNodeKeys)
  const fromProperty =
    filterNodeKeys.length > 0 &&
    selectedIds.size === propertyIds.length &&
    propertyIds.every((id) => selectedIds.has(id))
  const sourceLabel = fromProperty
    ? propertySelectionLabel(filterTree, filterNodeKeys, filterRules[filterRules.length - 1]?.name)
    : null

  const filterBar = (
    <FilterBar
      ready={filterReady}
      hint={filterHint}
      spatialRoot={root}
      catalog={propertyCatalog}
      spec={spec}
      rules={filterRules}
      valueTree={filterTree}
      selectedKeys={filterNodeKeys}
      matchCount={matchCount}
      error={filterError}
      onChange={onSpecChange}
      onRulesChange={onFilterRulesChange}
      onSelectValue={onSelectFilterValue}
      colorize={filterColorize}
      onColorizeChange={onFilterColorizeChange}
    />
  )

  return (
    <aside className="flex h-full min-h-0 w-full flex-col bg-card">
      {showTabs && (
        <PanelTabs
          value={tab}
          onChange={onTabChange}
          tabs={[
            { id: 'tree', label: 'Tree', icon: <ListTree className="h-3.5 w-3.5" /> },
            { id: 'filters', label: 'Filters', icon: <Filter className="h-3.5 w-3.5" /> },
            { id: 'views', label: 'Views', icon: <Layers className="h-3.5 w-3.5" /> },
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
        ) : tab === 'reports' ? (
          <ReportsPanel
            ready={reportReady}
            busy={reportBusy}
            progress={reportProgress}
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
        ) : tab === 'views' ? (
          <div className="flex h-full min-h-0 flex-col">
            <div className="min-h-0 flex-[5] overflow-hidden">
              <FilterBar
                ready={filterReady}
                hint={filterHint}
                intro="Click several property values to combine them into one view. Ctrl-click also works, and you can add more elements in 3D."
                spatialRoot={root}
                catalog={propertyCatalog}
                spec={spec}
                rules={filterRules}
                valueTree={filterTree}
                selectedKeys={filterNodeKeys}
                matchCount={matchCount}
                error={filterError}
                onChange={onSpecChange}
                onRulesChange={onFilterRulesChange}
                onSelectValue={onSelectFilterValue}
                colorize={filterColorize}
                onColorizeChange={onFilterColorizeChange}
                showColorize={false}
                multiSelect
              />
            </div>
            <div className="min-h-0 flex-[4] overflow-hidden border-t border-border">
              <ViewsPanel
                views={savedViews}
                selectedCount={selectedIds.size}
                activeViewId={activeViewId}
                sourceLabel={sourceLabel}
                exportBusy={viewExportBusy}
                exportingViewId={exportingViewId}
                onSave={onSaveView}
                onShow={onShowView}
                onUpdate={onUpdateView}
                onExport={onExportView}
                onDelete={onDeleteView}
              />
            </div>
          </div>
        ) : (
          filterBar
        )}
      </div>
    </aside>
  )
}
