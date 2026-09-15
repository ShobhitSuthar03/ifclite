import { BUILTIN_LENSES, type Lens, type LensEvaluationResult } from '@ifc-lite/lens'
import { Eye, Palette } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn, formatCount } from '@/lib/utils'

type LensPanelProps = {
  activeId: string | null
  result: LensEvaluationResult | null
  disabled: boolean
  onSelect: (lens: Lens | null) => void
}

export function LensPanel({ activeId, result, disabled, onSelect }: LensPanelProps) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-start gap-2 border-b border-border p-3">
        <Palette className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0">
          <p className="text-[13px] font-semibold">Lenses</p>
          <p className="text-[11px] text-muted-foreground">
            Colorize, hide, or ghost elements from IFC class and property rules.
          </p>
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-1 p-2">
          <button
            type="button"
            disabled={disabled}
            className={cn(
              'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] hover:bg-accent disabled:opacity-40',
              activeId == null && 'bg-primary/15',
            )}
            onClick={() => onSelect(null)}
          >
            <Eye className="h-3.5 w-3.5 text-muted-foreground" />
            None
          </button>
          {BUILTIN_LENSES.map((lens) => (
            <button
              key={lens.id}
              type="button"
              disabled={disabled}
              className={cn(
                'flex w-full flex-col items-start rounded px-2 py-1.5 text-left hover:bg-accent disabled:opacity-40',
                activeId === lens.id && 'bg-primary/15',
              )}
              onClick={() => onSelect(lens)}
            >
              <span className="text-[13px]">{lens.name}</span>
              {activeId === lens.id && result ? (
                <span className="font-mono text-[10px] text-muted-foreground">
                  {formatCount([...result.ruleCounts.values()].reduce((sum, count) => sum + count, 0))} matches
                </span>
              ) : null}
            </button>
          ))}
        </div>
        {activeId && result ? (
          <div className="border-t border-border px-3 py-2">
            <p className="mb-1 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">Legend</p>
            {[...result.ruleCounts.entries()].map(([ruleId, count]) => {
              const lens = BUILTIN_LENSES.find((item) => item.id === activeId)
              const rule = lens?.rules.find((item) => item.id === ruleId)
              if (!rule) return null
              return (
                <div key={ruleId} className="flex items-center gap-2 py-0.5 text-[11px]">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: rule.color }} />
                  <span className="min-w-0 flex-1 truncate">{rule.name}</span>
                  <span className="font-mono text-muted-foreground">{formatCount(count)}</span>
                </div>
              )
            })}
            <p className="mt-2 text-[10px] text-muted-foreground">
              Unmatched elements are ghosted. Hide rules remove them from the view.
            </p>
          </div>
        ) : null}
      </ScrollArea>
    </div>
  )
}
