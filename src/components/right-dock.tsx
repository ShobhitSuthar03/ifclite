import { FileDown, Info, Calculator, LayoutDashboard } from 'lucide-react'
import { CsvExportPanel } from '@/components/csv-export-panel'
import { DashboardPanel } from '@/components/dashboard-panel'
import { FormworkPanel } from '@/components/formwork-panel'
import { PanelTabs } from '@/components/panel-tabs'
import { PropertiesPanel } from '@/components/properties-panel'
import type { EntityData } from '@/lib/ifc-data'
import type { AreaMetrics, QuantityResult } from '@/lib/geometry-qto'
import type { ReportResult, ReportRow } from '@/lib/bim-sql'

export type RightTab = 'properties' | 'quantities' | 'export' | 'dashboard'

type RightDockProps = {
  tab: RightTab
  onTabChange: (tab: RightTab) => void
  entity: EntityData | null
  parsing: boolean
  meshCount: number
  vertices: number
  triangles: number
  computedMetrics: AreaMetrics | null
  selectionCount: number
  entities: EntityData[]
  mutationCount: number
  onEditAttribute?: (name: string, value: string) => void
  onEditProperty?: (pset: string, name: string, value: string) => void
  onClose: () => void
  fileName: string
  bytes: Uint8Array | null
  isolatedIds: Set<number> | null
  visibleIds: Set<number>
  selectedIds: Set<number>
  formwork: QuantityResult | null
  quantityBusy: boolean
  selectedFaceId?: string | null
  onSelectFace?: (faceId: string | null) => void
  onExported: (message: string) => void
  onError: (message: string) => void
  report: ReportResult | null
  reportBusy: boolean
  followViewer: boolean
  onReportRow: (row: ReportRow) => void
  onReportExport: (format: 'csv' | 'json' | 'xlsx') => void
  showTabs?: boolean
}

export function RightDock({
  tab,
  onTabChange,
  entity,
  parsing,
  meshCount,
  vertices,
  triangles,
  computedMetrics,
  selectionCount,
  entities,
  mutationCount,
  onEditAttribute,
  onEditProperty,
  onClose,
  fileName,
  bytes,
  isolatedIds,
  visibleIds,
  selectedIds,
  formwork,
  quantityBusy,
  selectedFaceId = null,
  onSelectFace,
  onExported,
  onError,
  report,
  reportBusy,
  followViewer,
  onReportRow,
  onReportExport,
  showTabs = true,
}: RightDockProps) {
  return (
    <aside className="flex h-full min-h-0 w-full flex-col bg-card">
      {showTabs && (
        <PanelTabs
          value={tab}
          onChange={onTabChange}
          tabs={[
            { id: 'properties', label: 'Properties', icon: <Info className="h-3.5 w-3.5" /> },
            { id: 'quantities', label: 'Quantities', icon: <Calculator className="h-3.5 w-3.5" /> },
            { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="h-3.5 w-3.5" /> },
            { id: 'export', label: 'Export', icon: <FileDown className="h-3.5 w-3.5" /> },
          ]}
        />
      )}
      <div className="min-h-0 flex-1">
        {tab === 'properties' ? (
          <PropertiesPanel
            data={entity}
            entities={entities}
            parsing={parsing}
            meshCount={meshCount}
            vertices={vertices}
            triangles={triangles}
            computedMetrics={computedMetrics}
            selectionCount={selectionCount}
            mutationCount={mutationCount}
            embedded
            onClose={onClose}
            onEditAttribute={onEditAttribute}
            onEditProperty={onEditProperty}
          />
        ) : tab === 'quantities' ? (
          <FormworkPanel
            result={formwork}
            busy={quantityBusy}
            selectedIds={selectedIds}
            isolatedIds={isolatedIds}
            selectedFaceId={selectedFaceId}
            onSelectFace={onSelectFace}
          />
        ) : tab === 'dashboard' ? (
          <DashboardPanel
            result={report}
            busy={reportBusy}
            followViewer={followViewer}
            chartMetric={chartMetricOf(report)}
            onRowClick={onReportRow}
            onExport={onReportExport}
          />
        ) : (
          <CsvExportPanel
            fileName={fileName}
            bytes={bytes}
            isolatedIds={isolatedIds}
            visibleIds={visibleIds}
            selectedIds={selectedIds}
            formwork={formwork}
            onExported={onExported}
            onError={onError}
          />
        )}
      </div>
    </aside>
  )
}

function chartMetricOf(result: ReportResult | null): string {
  if (!result) return 'count'
  for (const key of ['volume', 'estimated', 'percent', 'count', 'cost']) {
    if (result.columns.some((column) => column.key === key)) return key
  }
  return result.columns.find((column) => column.kind !== 'text')?.key ?? 'count'
}
