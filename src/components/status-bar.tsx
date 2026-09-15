import { useEffect, useState, type MutableRefObject } from 'react'
import { Calculator } from 'lucide-react'
import { cn, formatBytes, formatCount } from '@/lib/utils'
import type { GeometryEngineStatus, LoadProgress, LoadResult } from '@/lib/ifc-loader'

type StatusBarProps = {
  progress: LoadProgress | null
  result: LoadResult | null
  selectedId: number | null
  selectedLabel: string | null
  hoverBindRef: MutableRefObject<((id: number | null) => void) | null>
  hoverLookupRef: MutableRefObject<(id: number) => string>
  parsing: boolean
  engineStatus: GeometryEngineStatus
  isolatedCount: number | null
  exportMessage: string | null
  error: string | null
  quantitiesOpen: boolean
  canCalculate: boolean
  quantityBusy: boolean
  quantitySummary: string | null
  onOpenQuantities: () => void
  onCalculateQuantities: () => void
}

function HoverLabel({
  bindRef,
  lookupRef,
  hidden,
}: {
  bindRef: MutableRefObject<((id: number | null) => void) | null>
  lookupRef: MutableRefObject<(id: number) => string>
  hidden: boolean
}) {
  const [label, setLabel] = useState<string | null>(null)
  useEffect(() => {
    bindRef.current = (id) => setLabel(id == null ? null : lookupRef.current(id))
    return () => {
      bindRef.current = null
    }
  }, [bindRef, lookupRef])
  if (hidden || !label) return null
  return <span className="truncate">{label}</span>
}

export function StatusBar({
  progress,
  result,
  selectedId,
  selectedLabel,
  hoverBindRef,
  hoverLookupRef,
  parsing,
  engineStatus,
  isolatedCount,
  exportMessage,
  error,
  quantitiesOpen,
  canCalculate,
  quantityBusy,
  quantitySummary,
  onOpenQuantities,
  onCalculateQuantities,
}: StatusBarProps) {
  const processed = progress?.processed ?? result?.meshes.length ?? 0
  const total = progress?.total ?? result?.totalMeshes ?? 0
  const ratio = total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0

  return (
    <footer className="flex h-9 shrink-0 items-center justify-between gap-3 border-t border-border bg-muted px-3 text-[11px] text-muted-foreground">
      <div className="flex min-w-0 items-center gap-4 overflow-hidden">
        {error ? (
          <span className="truncate text-destructive">{error}</span>
        ) : result ? (
          <>
            <span className="truncate">
              Selection:{' '}
              <strong className="text-foreground">
                {selectedLabel ?? (selectedId != null ? `#${selectedId}` : 'none')}
              </strong>
            </span>
            {isolatedCount != null && <span>{formatCount(isolatedCount)} isolated</span>}
            {parsing ? <span>Indexing IFC…</span> : null}
            {exportMessage && <span className="truncate">{exportMessage}</span>}
            {quantitySummary && !quantityBusy ? (
              <span className="truncate text-foreground">{quantitySummary}</span>
            ) : null}
            <HoverLabel bindRef={hoverBindRef} lookupRef={hoverLookupRef} hidden={selectedId != null} />
          </>
        ) : progress ? (
          <span>
            {progress.phase === 'init'
              ? 'Loading WASM geometry engine…'
              : progress.phase === 'cache-lookup'
                ? 'Checking native geometry cache…'
                : `Streaming ${formatCount(processed)}${total ? ` / ${formatCount(total)}` : ''} meshes`}
          </span>
        ) : engineStatus === 'loading' ? (
          <span>Loading geometry engine…</span>
        ) : engineStatus === 'error' ? (
          <span>Geometry engine failed to start — load an IFC to retry</span>
        ) : (
          <span>Ready · drop an IFC file or use Load IFC</span>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {result && (
          <>
            <button
              type="button"
              className={cn(
                'flex h-7 items-center gap-1 rounded border px-2 text-[11px]',
                quantitiesOpen
                  ? 'border-primary bg-card text-primary'
                  : 'border-border bg-background text-foreground hover:bg-accent',
              )}
              onClick={onOpenQuantities}
            >
              <Calculator className="h-3.5 w-3.5" />
              Quantities
            </button>
            <button
              type="button"
              className="h-7 rounded bg-primary px-2.5 text-[11px] font-medium text-primary-foreground disabled:opacity-40"
              disabled={!canCalculate || quantityBusy}
              title={canCalculate ? 'Calculate geometry quantities for the selection' : 'Select an element first'}
              onClick={onCalculateQuantities}
            >
              {quantityBusy ? 'Calculating…' : 'Calculate quantities'}
            </button>
            <span>
              {formatCount(result.totalMeshes)} meshes · {formatBytes(result.fileBytes)} · {result.elapsedMs} ms
              {result.cacheHit ? ' · mesh cache' : ''}
            </span>
          </>
        )}
        <div className="h-1 w-20 overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{
              width: `${
                progress && progress.phase !== 'complete'
                  ? Math.max(ratio, 8)
                  : result
                    ? 100
                    : engineStatus === 'loading'
                      ? 40
                      : 0
              }%`,
            }}
          />
        </div>
      </div>
    </footer>
  )
}
