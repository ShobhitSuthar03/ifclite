import { Calculator } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { ElementQuantity, FaceQuantity, QuantityResult } from '@/lib/geometry-qto'
import { AREA_FIELDS, STANDARD_FIELDS } from '@/lib/geometry-qto'
import type { TakeoffProgress } from '@/lib/takeoff-scope'
import { cn, formatCount } from '@/lib/utils'

type FormworkPanelProps = {
  result: QuantityResult | null
  busy: boolean
  progress: TakeoffProgress | null
  selectedIds: Set<number>
  scopeIds: number[]
  scopeLabel: string
  missingCount: number
  stale: boolean
  selectedFaceId?: string | null
  onSelectFace?: (faceId: string | null) => void
  onCalculate: () => void
  onCancel: () => void
  onRecalculate: () => void
  onKeepPrevious: () => void
}

function formatVolume(value: number): string {
  return `${value.toFixed(3)} m³`
}

function formatLength(value: number): string {
  return `${value.toFixed(3)} m`
}

function formatArea(value: number): string {
  return `${value.toFixed(3)} m²`
}

function faceLabel(normal: [number, number, number]): string {
  const [nx, ny, nz] = normal
  const ax = Math.abs(nx)
  const ay = Math.abs(ny)
  const az = Math.abs(nz)
  if (ax >= ay && ax >= az) return nx >= 0 ? '+X' : '−X'
  if (ay >= ax && ay >= az) return ny >= 0 ? '+Y' : '−Y'
  return nz >= 0 ? '+Z' : '−Z'
}

function kindClass(kind: FaceQuantity['kind']): string {
  if (kind === 'top') return 'text-[#cb4b16]'
  if (kind === 'bottom') return 'text-[#6c71c4]'
  return 'text-[#2aa198]'
}

export function FormworkPanel({
  result,
  busy,
  progress,
  selectedIds,
  scopeIds,
  scopeLabel,
  missingCount,
  stale,
  selectedFaceId = null,
  onSelectFace,
  onCalculate,
  onCancel,
  onRecalculate,
  onKeepPrevious,
}: FormworkPanelProps) {
  const selectedElements = result ? result.elements.filter((item) => selectedIds.has(item.expressId)) : []
  const scopeSet = new Set(scopeIds)
  const scopedMeasured = result
    ? result.elements.filter((item) => (scopeSet.size > 0 ? scopeSet.has(item.expressId) : selectedIds.has(item.expressId)))
    : []
  const summaryRows = selectedIds.size > 1 ? selectedElements : selectedIds.size === 1 ? selectedElements : scopedMeasured
  const showDetail = selectedIds.size === 1 && selectedElements[0]
  const showAggregate = !showDetail && summaryRows.length > 0

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-start gap-2 border-b border-border p-3">
        <Calculator className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0">
          <p className="text-[13px] font-semibold">Geometry quantities</p>
          <p className="text-[11px] text-muted-foreground">
            Classify in Filters or Breakdown, then calculate this set. 3D stays interactive while measuring.
          </p>
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-3 px-3 py-3">
          {stale ? (
            <section className="rounded border border-primary/40 bg-primary/10 px-3 py-2">
              <p className="text-[12px] font-medium">This takeoff is for a previous selection.</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Recalculate quantities for {scopeLabel || 'the current set'}?
              </p>
              <div className="mt-2 flex gap-2">
                <Button size="sm" onClick={onRecalculate} disabled={busy || scopeIds.length === 0}>
                  Recalculate this set
                </Button>
                <Button size="sm" variant="ghost" onClick={onKeepPrevious} disabled={busy}>
                  Keep previous
                </Button>
              </div>
            </section>
          ) : null}

          {busy && progress ? (
            <section className="rounded border border-border px-3 py-2">
              <p className="text-[12px] font-medium text-foreground">
                Measuring {formatCount(progress.done)} / {formatCount(progress.total)}
              </p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${progress.total ? Math.min(100, (progress.done / progress.total) * 100) : 0}%` }}
                />
              </div>
              <Button size="sm" variant="ghost" className="mt-2" onClick={onCancel}>
                Cancel
              </Button>
            </section>
          ) : null}

          {!busy && scopeIds.length === 0 ? (
            <p className="text-[12px] text-muted-foreground">
              Select a property value in Filters or Breakdown, or pick elements in 3D, then calculate quantities for
              that set.
            </p>
          ) : null}

          {!busy && scopeIds.length > 0 && missingCount > 0 && !stale ? (
            <section className="rounded border border-border px-3 py-2">
              <p className="text-[12px]">
                {scopeLabel ? <span className="font-medium">{scopeLabel}</span> : 'Current set'}
                <span className="text-muted-foreground">
                  {' '}
                  · {formatCount(scopeIds.length)} element{scopeIds.length === 1 ? '' : 's'}
                  {missingCount < scopeIds.length
                    ? ` · ${formatCount(scopeIds.length - missingCount)} already measured`
                    : ''}
                </span>
              </p>
              <Button size="sm" className="mt-2" onClick={onCalculate}>
                Calculate quantities for {formatCount(missingCount)} element{missingCount === 1 ? '' : 's'}
              </Button>
            </section>
          ) : null}

          {showAggregate ? <AggregateCard rows={summaryRows} selectedCount={selectedIds.size} /> : null}

          {showDetail ? (
            <SelectedElement
              element={selectedElements[0]}
              selectedFaceId={selectedFaceId}
              onSelectFace={onSelectFace}
            />
          ) : null}

          {selectedIds.size > 1 && selectedElements.length === 0 && result && !busy ? (
            <p className="text-[11px] text-muted-foreground">
              None of the {formatCount(selectedIds.size)} selected elements have been measured yet.
            </p>
          ) : null}
        </div>
      </ScrollArea>
    </div>
  )
}

function AggregateCard({ rows, selectedCount }: { rows: ElementQuantity[]; selectedCount: number }) {
  const totals = {
    LATERALAREA: 0,
    UNDERAREA: 0,
    TOPAREA: 0,
    GROSSAREA: 0,
    COVEREDAREA: 0,
    UNCOVEREDAREA: 0,
    VOLUME: 0,
    LENGTH: 0,
    WIDTH: 0,
    HEIGHT: 0,
    COUNT: 0,
  }
  const byType = new Map<string, { count: number; lateral: number; net: number }>()
  for (const element of rows) {
    totals.LATERALAREA += element.metrics.LATERALAREA
    totals.UNDERAREA += element.metrics.UNDERAREA
    totals.TOPAREA += element.metrics.TOPAREA
    totals.GROSSAREA += element.metrics.GROSSAREA
    totals.COVEREDAREA += element.metrics.COVEREDAREA
    totals.UNCOVEREDAREA += element.metrics.UNCOVEREDAREA
    totals.VOLUME += element.metrics.VOLUME
    totals.LENGTH += element.metrics.LENGTH
    totals.WIDTH += element.metrics.WIDTH
    totals.HEIGHT += element.metrics.HEIGHT
    totals.COUNT += element.metrics.COUNT
    const row = byType.get(element.ifcType) ?? { count: 0, lateral: 0, net: 0 }
    row.count += 1
    row.lateral += element.metrics.LATERALAREA
    row.net += element.metrics.UNCOVEREDAREA
    byType.set(element.ifcType, row)
  }

  return (
    <div className="space-y-3">
      <section className="overflow-hidden rounded border border-border">
        <header className="bg-muted px-3 py-2 text-[12px] font-semibold">
          {selectedCount > 1 ? 'Selected set' : 'Measured set'} · {formatCount(rows.length)}
          {selectedCount > rows.length ? ` of ${formatCount(selectedCount)}` : ''} elements
        </header>
        <div className="px-3 py-1.5">
          <Row label="Count" value={formatCount(totals.COUNT)} />
          <Row label="Volume" value={formatVolume(totals.VOLUME)} />
          <Row label="Length" value={formatLength(totals.LENGTH)} />
          <Row label="Width" value={formatLength(totals.WIDTH)} />
          <Row label="Height" value={formatLength(totals.HEIGHT)} />
          <Row label="GROSSAREA" value={formatArea(totals.GROSSAREA)} />
          <Row label="LATERALAREA" value={formatArea(totals.LATERALAREA)} />
          <Row label="TOPAREA" value={formatArea(totals.TOPAREA)} />
          <Row label="UNDERAREA" value={formatArea(totals.UNDERAREA)} />
          <Row label="COVEREDAREA" value={formatArea(totals.COVEREDAREA)} />
          <Row label="UNCOVEREDAREA" value={formatArea(totals.UNCOVEREDAREA)} />
        </div>
      </section>
      {byType.size > 0 ? (
        <section className="overflow-hidden rounded border border-border">
          <header className="bg-muted px-3 py-2 text-[12px] font-semibold">By type</header>
          <div className="px-3 py-1.5">
            {[...byType.entries()]
              .sort((a, b) => b[1].count - a[1].count)
              .map(([type, row]) => (
                <div key={type} className="border-b border-dashed border-border py-1 text-[12px] last:border-b-0">
                  <div className="flex justify-between gap-2">
                    <span className="truncate">{type}</span>
                    <span className="font-mono text-[11px] text-muted-foreground">{formatCount(row.count)}</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    lateral {formatArea(row.lateral)} · net {formatArea(row.net)}
                  </div>
                </div>
              ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}

function SelectedElement({
  element,
  selectedFaceId,
  onSelectFace,
}: {
  element: ElementQuantity
  selectedFaceId: string | null
  onSelectFace?: (faceId: string | null) => void
}) {
  return (
    <section className="overflow-hidden rounded border border-border">
      <header className="bg-muted px-3 py-2 text-[12px] font-semibold">
        #{element.expressId} · {element.ifcType}
      </header>
      <div className="px-3 py-1.5">
        {STANDARD_FIELDS.map((field) => (
          <Row
            key={field.key}
            label={field.label}
            value={
              field.unit
                ? `${element.metrics[field.key].toFixed(3)} ${field.unit}`
                : formatCount(element.metrics[field.key])
            }
            hint={field.hint}
          />
        ))}
        {AREA_FIELDS.map((field) => (
          <Row
            key={field.key}
            label={field.label}
            value={formatArea(element.metrics[field.key])}
            hint={field.hint}
          />
        ))}
      </div>
      <div className="border-t border-border">
        <p className="px-3 py-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
          Faces ({formatCount(element.faces.length)})
        </p>
        {element.faces.map((face) => (
          <button
            key={face.faceId}
            type="button"
            disabled={!onSelectFace}
            onClick={() => onSelectFace?.(face.faceId)}
            title={onSelectFace ? 'Highlight this face in the 3D view (Calculated view)' : undefined}
            className={cn(
              'block w-full border-b border-dashed border-border px-3 py-2 text-left last:border-b-0',
              onSelectFace ? 'cursor-pointer hover:bg-accent' : '',
              face.faceId === selectedFaceId ? 'bg-primary/10 ring-1 ring-inset ring-primary' : '',
            )}
          >
            <div className="flex items-baseline justify-between gap-2 text-[12px]">
              <span className="font-medium">
                {faceLabel(face.normal)} <span className={`font-normal ${kindClass(face.kind)}`}>{face.kind}</span>
              </span>
              <span className="font-mono text-[11px] text-muted-foreground">{face.faceId}</span>
            </div>
            <div className="mt-1 grid grid-cols-3 gap-2 text-[11px]">
              <div>
                <div className="text-muted-foreground">Gross</div>
                <div className="font-medium">{formatArea(face.grossArea)}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Covered</div>
                <div className="font-medium">{formatArea(face.overlapArea)}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Net</div>
                <div className="font-medium">{formatArea(face.netArea)}</div>
              </div>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {face.overlappingIds.length === 0
                ? 'No contacting faces'
                : `Contact #${face.overlappingIds.join(', #')}`}
            </p>
          </button>
        ))}
      </div>
    </section>
  )
}

function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="border-b border-dashed border-border py-1 last:border-b-0" title={hint}>
      <div className="flex justify-between gap-3 text-[12px]">
        <dt className="max-w-[58%] shrink-0 text-muted-foreground">{label}</dt>
        <dd className="font-medium">{value}</dd>
      </div>
    </div>
  )
}
