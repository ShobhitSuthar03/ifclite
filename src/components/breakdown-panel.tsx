import { Folder } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { BREAKDOWN_OPTIONS, type BreakdownGroup, type BreakdownMode } from '@/lib/breakdown'
import { isAdditiveModifier } from '@/lib/selection'
import { cn, formatCount } from '@/lib/utils'

type BreakdownPanelProps = {
  groups: BreakdownGroup[]
  mode: BreakdownMode
  active: boolean
  selectedKey: string | null
  selectedIds: Set<number>
  onModeChange: (mode: BreakdownMode) => void
  onSelectGroup: (group: BreakdownGroup) => void
  onSelectId: (expressId: number, additive?: boolean) => void
}

export function BreakdownPanel({
  groups,
  mode,
  active,
  selectedKey,
  selectedIds,
  onModeChange,
  onSelectGroup,
  onSelectId,
}: BreakdownPanelProps) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-col gap-1 border-b border-border px-3 py-2">
        <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Group by</span>
        <select
          className="h-8 w-full rounded border border-border bg-background px-2 text-xs outline-none focus-visible:border-primary"
          value={mode}
          onChange={(event) => onModeChange(event.target.value as BreakdownMode)}
        >
          {BREAKDOWN_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        {!active ? (
          <p className="px-3 py-6 text-xs text-muted-foreground">
            Apply a type, storey, or property filter to build a breakdown of the isolated set.
          </p>
        ) : groups.length === 0 ? (
          <p className="px-3 py-6 text-xs text-muted-foreground italic">No matches.</p>
        ) : (
          <div className="py-1">
            {groups.map((group) => (
              <div key={group.key}>
                <button
                  type="button"
                  className={cn(
                    'flex w-full items-center gap-2 rounded-[3px] px-3 py-1.5 text-left text-[13px] hover:bg-accent',
                    selectedKey === group.key && 'bg-primary/20 text-foreground',
                  )}
                  onClick={() => onSelectGroup(group)}
                >
                  <Folder className="h-3.5 w-3.5 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1 truncate">{group.label}</span>
                  <span className="font-mono text-[11px] text-muted-foreground">({formatCount(group.count)})</span>
                </button>
                {selectedKey === group.key &&
                  group.ids.slice(0, 24).map((id) => (
                    <button
                      key={id}
                      type="button"
                      className={cn(
                        'flex w-full px-8 py-0.5 font-mono text-[11px] hover:bg-accent hover:text-foreground',
                        selectedIds.has(id)
                          ? 'bg-primary/20 text-foreground'
                          : 'text-muted-foreground',
                      )}
                      onClick={(event) => onSelectId(id, isAdditiveModifier(event))}
                    >
                      #{id}
                    </button>
                  ))}
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}
