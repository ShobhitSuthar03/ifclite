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
  quantityBusy: boolean
  surfacesReady: boolean
  quantitySummary: string | null
  reportBusy?: boolean
  reportProgress?: { done: number; total: number } | null
  onOpenQuantities: () => void
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
  quantityBusy,
  surfacesReady,
  quantitySummary,
  reportBusy = false,
  reportProgress = null,
  onOpenQuantities,
}: StatusBarProps) {
        const processed = progress?.processed ?? result?.totalMeshes ?? 0
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
            {parsing ? <span>Still reading properties…</span> : null}
            {reportBusy ? (
              <span className="truncate text-foreground">
                Creating report
                {reportProgress && reportProgress.total > 0
                  ? ` · ${formatCount(reportProgress.done)} / ${formatCount(reportProgress.total)}`
                  : '…'}
              </span>
            ) : null}
            {exportMessage && <span className="truncate">{exportMessage}</span>}
            {quantityBusy ? (
              <span className="truncate text-foreground">{quantitySummary ?? 'Calculating surfaces…'}</span>
            ) : quantitySummary ? (
              <span className="truncate text-foreground">{quantitySummary}</span>
            ) : surfacesReady ? (
              <span className="truncate">Surfaces ready</span>
            ) : null}
            <HoverLabel bindRef={hoverBindRef} lookupRef={hoverLookupRef} hidden={selectedId != null} />
          </>
        ) : progress ? (
          <span>
            {progress.phase === 'init'
              ? 'Starting the 3D engine…'
              : progress.phase === 'cache-lookup'
                ? 'Looking for a saved 3D cache…'
                : progress.cacheHit
                  ? `Opening saved 3D · ${formatCount(processed)}${total ? ` / ${formatCount(total)}` : ''}`
                  : `Building 3D · ${formatCount(processed)}${total ? ` / ${formatCount(total)}` : ''}`}
          </span>
        ) : engineStatus === 'loading' ? (
          <span>Loading geometry engine…</span>
        ) : engineStatus === 'error' ? (
          <span>Geometry engine failed to start — load an IFC to retry</span>
        ) : (
          <span>Ready — create a project, then open an IFC</span>
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
            <span>
              {formatCount(result.totalMeshes)} parts · {formatBytes(result.fileBytes)}
              {result.cacheHit ? ' · reused saved 3D' : ' · first 3D build'}
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
