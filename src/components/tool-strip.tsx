import { Bot, Eye, EyeOff, Focus, Ghost, Home, Layers, ListTree, MousePointerClick, Palette } from 'lucide-react'
import type { DisplayMode } from '@/lib/view-visibility'
import type { EstimationPaneId, EstimationPanes } from '@/lib/panel-layout'
import { cn, formatCount } from '@/lib/utils'

type ToolStripProps = {
  canFit: boolean
  matchCount: number | null
  hasSelection: boolean
  displayMode: DisplayMode
  hiddenCount: number
  canShowAll: boolean
  calculatedView: boolean
  canShowCalculatedView: boolean
  faceSelectMode: boolean
  onFit: () => void
  onHide: () => void
  onGhost: () => void
  onIsolate: () => void
  onShowAll: () => void
  onToggleCalculatedView: () => void
  onToggleFaceSelectMode: () => void
  estimationPanes?: EstimationPanes
  onToggleEstimationPane?: (id: EstimationPaneId) => void
}

const btn =
  'flex h-8 items-center gap-1 rounded px-2 text-[11px] text-foreground hover:bg-accent disabled:opacity-40'

export function ToolStrip({
  canFit,
  matchCount,
  hasSelection,
  displayMode,
  hiddenCount,
  canShowAll,
  calculatedView,
  canShowCalculatedView,
  faceSelectMode,
  onFit,
  onHide,
  onGhost,
  onIsolate,
  onShowAll,
  onToggleCalculatedView,
  onToggleFaceSelectMode,
  estimationPanes,
  onToggleEstimationPane,
}: ToolStripProps) {
  return (
    <div className="flex h-10 shrink-0 items-center gap-1 border-b border-border bg-card px-3">
      <button type="button" title="Fit model in view" disabled={!canFit} className={cn(btn, 'w-8 px-0')} onClick={onFit}>
        <Home className="h-4 w-4" />
      </button>
      <span className="mx-1 h-5 w-px bg-border" />
      <button
        type="button"
        title="Hide selected"
        disabled={!hasSelection}
        className={btn}
        onClick={onHide}
      >
        <EyeOff className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Hide</span>
      </button>
      <button
        type="button"
        title="Ghost the rest of the model (selected stays solid)"
        disabled={!hasSelection}
        className={cn(btn, displayMode === 'ghost' && 'bg-primary/20 text-primary')}
        onClick={onGhost}
      >
        <Ghost className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Ghost</span>
      </button>
      <button
        type="button"
        title="Isolate selected (hide everything else)"
        disabled={!hasSelection}
        className={cn(btn, displayMode === 'isolate' && 'bg-primary/20 text-primary')}
        onClick={onIsolate}
      >
        <Focus className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Isolate</span>
      </button>
      <button type="button" title="Show all elements" disabled={!canShowAll} className={btn} onClick={onShowAll}>
        <Eye className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Show all</span>
      </button>
      <span className="mx-1 h-5 w-px bg-border" />
      <button
        type="button"
        title={
          canShowCalculatedView
            ? 'Toggle between native materials and calculated quantity colors'
            : 'Select elements to measure surfaces'
        }
        disabled={!canShowCalculatedView}
        className={cn(btn, calculatedView && 'bg-primary/20 text-primary')}
        onClick={onToggleCalculatedView}
      >
        <Palette className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">{calculatedView ? 'Calculated view' : 'Native view'}</span>
      </button>
      <button
        type="button"
        title="Click faces to gather them into a manual takeoff (works in native or calculated view)"
        className={cn(btn, faceSelectMode && 'bg-primary/20 text-primary')}
        onClick={onToggleFaceSelectMode}
      >
        <MousePointerClick className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Select faces</span>
      </button>
      <span className="mx-2 hidden h-5 w-px bg-border sm:block" />
      <p className="hidden text-[11px] text-muted-foreground lg:block">
        Left-drag orbit · Right-drag pan · Scroll zoom · Click select · Ctrl+click add
      </p>
      <div className="ml-auto flex items-center gap-1">
        {estimationPanes && onToggleEstimationPane ? (
          <div className="mr-1 flex items-center gap-0.5 rounded border border-border bg-background p-0.5">
            {(
              [
                ['boq', 'BOQ', ListTree],
                ['buildup', 'Assembly', Layers],
                ['chat', 'Chat', Bot],
              ] as const
            ).map(([id, label, Icon]) => {
              const open = estimationPanes[id]
              return (
                <button
                  key={id}
                  type="button"
                  title={open ? `Hide ${label}` : `Show ${label}`}
                  className={cn(btn, 'h-7', open && 'bg-primary/20 text-primary')}
                  onClick={() => onToggleEstimationPane(id)}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span className="hidden xl:inline">{label}</span>
                </button>
              )
            })}
          </div>
        ) : null}
        {hiddenCount > 0 && (
          <span className="rounded-[3px] bg-secondary px-1.5 py-px text-[10px] font-semibold">
            {formatCount(hiddenCount)} hidden
          </span>
        )}
        {displayMode === 'ghost' && (
          <span className="rounded-[3px] bg-primary px-1.5 py-px text-[10px] font-semibold text-white">Ghost</span>
        )}
        {displayMode === 'isolate' && (
          <span className="rounded-[3px] bg-primary px-1.5 py-px text-[10px] font-semibold text-white">Isolated</span>
        )}
        {calculatedView && (
          <span className="rounded-[3px] bg-primary px-1.5 py-px text-[10px] font-semibold text-white">Calculated view</span>
        )}
        {faceSelectMode && (
          <span className="rounded-[3px] bg-primary px-1.5 py-px text-[10px] font-semibold text-white">Select faces</span>
        )}
        {matchCount != null && (
          <span className="rounded-[3px] bg-primary px-1.5 py-px text-[10px] font-semibold text-white">
            {formatCount(matchCount)} filtered
          </span>
        )}
      </div>
    </div>
  )
}
