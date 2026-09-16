import { useEffect, useMemo, useState } from 'react'
import {
  BUILTIN_LENSES,
  LENS_OPERATORS,
  LENS_PALETTE,
  type AutoColorSpec,
  type Lens,
  type LensEvaluationResult,
  type LensOperator,
} from '@ifc-lite/lens'
import { Eye, Palette, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { PropertyCatalogSet } from '@/lib/bim-sql'
import { cn, formatCount } from '@/lib/utils'

const fieldClass =
  'h-8 w-full rounded border border-border bg-background px-2 text-xs text-foreground outline-none focus-visible:border-primary disabled:opacity-50'

type LensLegendEntry = {
  id: string
  name: string
  color: string
  count: number
}

type LensPanelProps = {
  lenses: Lens[]
  activeId: string | null
  result: LensEvaluationResult | null
  legend: LensLegendEntry[]
  catalog: PropertyCatalogSet[]
  disabled: boolean
  hint?: string | null
  onSelect: (lens: Lens | null) => void
  onCreateAutoColor: (spec: AutoColorSpec, name: string) => void
  onCreatePropertyLens: (input: {
    propertySet: string
    propertyName: string
    operator: LensOperator
    propertyValue: string
    color: string
    kind: 'property' | 'quantity'
  }) => void
  onRemove: (id: string) => void
}

export function LensPanel({
  lenses,
  activeId,
  result,
  legend,
  catalog,
  disabled,
  hint,
  onSelect,
  onCreateAutoColor,
  onCreatePropertyLens,
  onRemove,
}: LensPanelProps) {
  const [pset, setPset] = useState(catalog[0]?.set ?? 'Pset_WallCommon')
  const [propName, setPropName] = useState(catalog[0]?.names[0] ?? 'IsExternal')
  const [operator, setOperator] = useState<LensOperator>('equals')
  const [value, setValue] = useState('')
  const [color, setColor] = useState<string>(LENS_PALETTE[0])
  const names = catalog.find((item) => item.set === pset)?.names ?? []
  const selected = catalog.find((item) => item.set === pset)
  const kind: 'property' | 'quantity' =
    selected?.kind === 'quantity' || pset.toLowerCase().startsWith('qto_') ? 'quantity' : 'property'

  useEffect(() => {
    if (catalog.length === 0) return
    if (catalog.some((item) => item.set === pset)) return
    setPset(catalog[0].set)
    setPropName(catalog[0].names[0] ?? '')
  }, [catalog, pset])

  const builtinIds = useMemo(() => new Set(BUILTIN_LENSES.map((lens) => lens.id)), [])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-start gap-2 border-b border-border p-3">
        <Palette className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0">
          <p className="text-[13px] font-semibold">Lenses</p>
          <p className="text-[11px] text-muted-foreground">
            Colorize, hide, or ghost from IFC class and property rules.
          </p>
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        {hint ? <p className="px-3 pt-2 text-[11px] text-muted-foreground">{hint}</p> : null}
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
          {lenses.map((lens) => (
            <div key={lens.id} className="flex items-start gap-1">
              <button
                type="button"
                disabled={disabled}
                className={cn(
                  'flex min-w-0 flex-1 flex-col items-start rounded px-2 py-1.5 text-left hover:bg-accent disabled:opacity-40',
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
              {!builtinIds.has(lens.id) ? (
                <button
                  type="button"
                  className="mt-1 rounded p-1 text-muted-foreground hover:bg-accent hover:text-destructive"
                  aria-label={`Remove ${lens.name}`}
                  onClick={() => onRemove(lens.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
          ))}
        </div>

        <div className="border-t border-border px-3 py-3">
          <p className="mb-2 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
            Color by property
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            <input
              className={fieldClass}
              disabled={disabled}
              list="lens-psets"
              value={pset}
              placeholder="Pset or Qto"
              onChange={(event) => {
                const next = event.target.value
                setPset(next)
                const nextNames = catalog.find((item) => item.set === next)?.names ?? []
                if (!nextNames.includes(propName)) setPropName(nextNames[0] ?? '')
              }}
            />
            <input
              className={fieldClass}
              disabled={disabled}
              list="lens-props"
              value={propName}
              placeholder="Property"
              onChange={(event) => setPropName(event.target.value)}
            />
          </div>
          <datalist id="lens-psets">
            {catalog.map((item) => (
              <option key={item.set} value={item.set} />
            ))}
          </datalist>
          <datalist id="lens-props">
            {names.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          <Button
            variant="outline"
            size="sm"
            className="mt-2 w-full"
            disabled={disabled || !pset.trim() || !propName.trim()}
            onClick={() =>
              onCreateAutoColor(
                {
                  source: kind,
                  psetName: pset.trim(),
                  propertyName: propName.trim(),
                },
                `By ${propName.trim()}`,
              )
            }
          >
            Auto-color distinct values
          </Button>
        </div>

        <div className="border-t border-border px-3 py-3">
          <p className="mb-2 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
            Property rule
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            <select
              className={fieldClass}
              disabled={disabled}
              value={operator}
              onChange={(event) => setOperator(event.target.value as LensOperator)}
            >
              {LENS_OPERATORS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <input
              className={fieldClass}
              disabled={disabled}
              value={value}
              placeholder="Value"
              onChange={(event) => setValue(event.target.value)}
            />
            <input
              type="color"
              className="h-8 w-full rounded border border-border bg-background"
              disabled={disabled}
              value={color}
              onChange={(event) => setColor(event.target.value)}
            />
            <Button
              variant="outline"
              size="sm"
              disabled={disabled || !pset.trim() || !propName.trim()}
              onClick={() =>
                onCreatePropertyLens({
                  propertySet: pset.trim(),
                  propertyName: propName.trim(),
                  operator,
                  propertyValue: value,
                  color,
                  kind,
                })
              }
            >
              <Plus />
              Add lens
            </Button>
          </div>
        </div>

        {activeId && legend.length > 0 ? (
          <div className="border-t border-border px-3 py-2">
            <p className="mb-1 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">Legend</p>
            {legend.map((entry) => (
              <div key={entry.id} className="flex items-center gap-2 py-0.5 text-[11px]">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: entry.color }} />
                <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                <span className="font-mono text-muted-foreground">{formatCount(entry.count)}</span>
              </div>
            ))}
            <p className="mt-2 text-[10px] text-muted-foreground">
              Unmatched elements are ghosted. Hide rules remove them from the view.
            </p>
          </div>
        ) : null}
      </ScrollArea>
    </div>
  )
}
