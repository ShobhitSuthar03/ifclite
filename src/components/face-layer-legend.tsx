import { cn } from '@/lib/utils'
import type { FaceQuantity } from '@/lib/geometry-qto'
import type { FaceLayer } from '@/lib/geometry-qto/overlay-mesh'

const LAYERS: Array<{ id: FaceLayer; label: string; color: string; hint: string }> = [
  { id: 'all', label: 'All faces', color: '#64748b', hint: 'Show every classified face' },
  { id: 'lateral', label: 'LATERALAREA', color: '#2aa198', hint: 'Vertical sides' },
  { id: 'top', label: 'TOPAREA', color: '#cb4b16', hint: 'Upward faces' },
  { id: 'bottom', label: 'UNDERAREA', color: '#6c71c4', hint: 'Soffits / undersides' },
]

function layerArea(faces: FaceQuantity[], layer: FaceLayer): number {
  let sum = 0
  for (const face of faces) {
    if (layer === 'all') sum += face.grossArea
    else if (face.kind === layer) sum += face.grossArea
  }
  return sum
}

type FaceLayerLegendProps = {
  faces: FaceQuantity[]
  layers: Set<FaceLayer>
  onToggle: (layer: FaceLayer) => void
}

export function FaceLayerLegend({ faces, layers, onToggle }: FaceLayerLegendProps) {
  return (
    <div className="absolute bottom-3 left-3 w-52 rounded border border-border bg-card/95 p-2 shadow-sm">
      <p className="mb-1.5 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
        Show in 3D
      </p>
      <div className="flex flex-col gap-0.5">
        {LAYERS.map((item) => {
          const area = layerArea(faces, item.id)
          const active = layers.has(item.id)
          return (
            <button
              key={item.id}
              type="button"
              title={item.hint}
              aria-pressed={active}
              className={cn(
                'flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-[11px] hover:bg-accent',
                active && 'bg-primary/15 text-foreground',
                !active && area <= 0 && item.id !== 'all' && 'opacity-40',
              )}
              onClick={() => onToggle(item.id)}
            >
              <span
                className={cn(
                  'flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border',
                  active ? 'border-foreground/40' : 'border-border',
                )}
                style={{ background: item.color }}
              />
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              <span className="font-mono text-[10px] text-muted-foreground">{area.toFixed(2)}</span>
            </button>
          )
        })}
      </div>
      <p className="mt-1.5 text-[10px] text-muted-foreground">
        Click rows to show one or more surface types.
      </p>
    </div>
  )
}
