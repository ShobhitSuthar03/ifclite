import { Calculator } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { ElementQuantity, FaceQuantity, QuantityResult } from '@/lib/geometry-qto'
import { AREA_FIELDS, STANDARD_FIELDS } from '@/lib/geometry-qto'
import { formatCount } from '@/lib/utils'

type FormworkPanelProps = {
  result: QuantityResult | null
  busy: boolean
  selectedIds: Set<number>
  isolatedIds: Set<number> | null
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

export function FormworkPanel({ result, busy, selectedIds, isolatedIds }: FormworkPanelProps) {
  if (busy) {
    return (
      <p className="px-3 py-6 text-xs text-muted-foreground">Calculating quantities for the selection…</p>
    )
  }
  if (!result) {
    return (
      <p className="px-3 py-6 text-xs text-muted-foreground">
        Load a model, select one or more elements, then click <strong className="text-foreground">Calculate quantities</strong> in
        the bottom bar. Takeoff does not run automatically.
      </p>
    )
  }
  if (result.elementCount === 0) {
    return (
      <p className="px-3 py-6 text-xs text-muted-foreground">
        No IfcBuildingElement faces were found for this selection.
      </p>
    )
  }

  const scopedElements = isolatedIds
    ? result.elements.filter((item) => isolatedIds.has(item.expressId))
    : result.elements
  const selectedElements = result.elements.filter((item) => selectedIds.has(item.expressId))

  const byType = new Map<string, { count: number; lateral: number; net: number }>()
  for (const element of scopedElements) {
    const row = byType.get(element.ifcType) ?? { count: 0, lateral: 0, net: 0 }
    row.count += 1
    row.lateral += element.metrics.LATERALAREA
    row.net += element.metrics.UNCOVEREDAREA
    byType.set(element.ifcType, row)
  }

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
  for (const element of scopedElements) {
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
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-start gap-2 border-b border-border p-3">
        <Calculator className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0">
          <p className="text-[13px] font-semibold">Geometry quantities</p>
          <p className="text-[11px] text-muted-foreground">
            Every IfcBuildingElement. Select objects to color laterals, tops, soffits, and contact in 3D.
            Ctrl/Cmd/Shift+click adds to the selection.
          </p>
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-3 px-3 py-3">
          <section className="overflow-hidden rounded border border-border">
            <header className="bg-muted px-3 py-2 text-[12px] font-semibold">
              {isolatedIds ? 'Isolated set' : 'Model'} · {formatCount(scopedElements.length)} elements
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

          {selectedIds.size === 0 ? (
            <p className="text-[11px] text-muted-foreground">
              Click a wall, slab, column, or other element in 3D. Hold Ctrl/Cmd or Shift to add more.
            </p>
          ) : selectedElements.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">
              No faces were extracted for the {formatCount(selectedIds.size)} selected element
              {selectedIds.size === 1 ? '' : 's'}.
            </p>
          ) : (
            selectedElements.map((element) => <SelectedElement key={element.expressId} element={element} />)
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

function SelectedElement({ element }: { element: ElementQuantity }) {
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
          <div key={face.faceId} className="border-b border-dashed border-border px-3 py-2 last:border-b-0">
            <div className="flex items-baseline justify-between gap-2 text-[12px]">
              <span className="font-medium">
                {faceLabel(face.normal)}{' '}
                <span className={`font-normal ${kindClass(face.kind)}`}>{face.kind}</span>
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
          </div>
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
