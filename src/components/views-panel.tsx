import { useMemo, useState } from 'react'
import { Download, Layers, Search, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { defaultViewName, type SavedView } from '@/lib/saved-views'
import { cn, formatCount } from '@/lib/utils'

type ViewsPanelProps = {
  views: SavedView[]
  selectedCount: number
  activeViewId: string | null
  sourceLabel?: string | null
  exportBusy?: boolean
  exportingViewId?: string | null
  onSave: (name: string) => void
  onShow: (view: SavedView) => void
  onUpdate: (view: SavedView) => void
  onExport: (view: SavedView) => void
  onDelete: (view: SavedView) => void
}

const fieldClass =
  'h-8 w-full rounded border border-border bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring'

export function ViewsPanel({
  views,
  selectedCount,
  activeViewId,
  sourceLabel = null,
  exportBusy = false,
  exportingViewId = null,
  onSave,
  onShow,
  onUpdate,
  onExport,
  onDelete,
}: ViewsPanelProps) {
  const [name, setName] = useState('')
  const [search, setSearch] = useState('')
  const canSave = selectedCount > 0
  const fallbackName = sourceLabel || defaultViewName(views)
  const commit = () => {
    if (!canSave) return
    onSave(name.trim() || fallbackName)
    setName('')
  }
  const filteredViews = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return views
    return views.filter((view) => view.name.toLowerCase().includes(needle))
  }, [views, search])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-start gap-2 border-b border-border bg-muted/40 p-3">
        <Layers className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0">
          <p className="text-[13px] font-semibold">Saved views</p>
          <p className="text-[11px] text-muted-foreground">
            Save the current selection — a property value from the list above, or elements you clicked in 3D.
          </p>
        </div>
      </div>
      <div className="space-y-2 border-b border-border p-3">
        <label className="block text-[12px]">
          <span className="mb-1 block text-muted-foreground">Name</span>
          <input
            className={fieldClass}
            value={name}
            placeholder={fallbackName}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return
              event.preventDefault()
              commit()
            }}
          />
        </label>
        <Button
          size="sm"
          className="w-full"
          disabled={!canSave}
          onClick={commit}
        >
          {sourceLabel ? `Save “${sourceLabel}”` : 'Save view from selection'}
          {selectedCount > 0 ? ` (${formatCount(selectedCount)})` : ''}
        </Button>
        {!canSave ? (
          <p className="text-[11px] text-muted-foreground italic">
            Click a property value above, or select elements in 3D / the tree.
          </p>
        ) : null}
      </div>
      {views.length > 0 ? (
        <div className="border-b border-border p-2">
          <label className="relative block">
            <Search className="pointer-events-none absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search views…"
              className={cn(fieldClass, 'pl-7')}
            />
          </label>
        </div>
      ) : null}
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-1 p-2">
          {views.length === 0 ? (
            <p className="px-1 py-4 text-xs text-muted-foreground italic">No saved views yet.</p>
          ) : filteredViews.length === 0 ? (
            <p className="px-1 py-4 text-xs text-muted-foreground italic">No views match “{search.trim()}”.</p>
          ) : (
            filteredViews.map((view) => {
              const active = view.id === activeViewId
              const exporting = exportBusy && exportingViewId === view.id
              return (
                <div
                  key={view.id}
                  className={cn('rounded border border-border p-2', active && 'border-primary/60 bg-primary/10')}
                >
                  <button
                    type="button"
                    className="w-full rounded px-0.5 text-left hover:bg-accent/60"
                    onClick={() => onShow(view)}
                  >
                    <span className="block truncate text-[13px] font-medium">{view.name}</span>
                    <span className="block text-[11px] text-muted-foreground">
                      {formatCount(view.ids.length)} element{view.ids.length === 1 ? '' : 's'}
                    </span>
                  </button>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    <Button type="button" size="sm" variant="outline" onClick={() => onShow(view)}>
                      Show
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={selectedCount === 0}
                      onClick={() => onUpdate(view)}
                    >
                      Update
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={exportBusy}
                      onClick={() => onExport(view)}
                    >
                      <Download />
                      {exporting ? 'Exporting…' : 'Export IFC'}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      title="Delete view"
                      className="ml-auto text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => onDelete(view)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
