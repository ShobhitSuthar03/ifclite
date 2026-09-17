import { useEffect, useMemo, useState } from 'react'
import { Check, ChevronDown, ChevronRight, Minus } from 'lucide-react'
import type { CostAssembly, CostKind } from '@/lib/cost-assembly/types'
import { displayText, englishHint } from '@/lib/cost-assembly/types'
import { COST_KIND_LABEL, COST_KIND_SHORT, formatAssemblyMoney, formatAssemblyQty, formatAssemblyUnit } from '@/lib/cost-assembly/search'
import { buildUpRows, type BuildUpRow } from '@/lib/cost-assembly/build-up'
import {
  TAKEOFF_QTY_FIELDS,
  computedLineAmount,
  measuredLineQty,
  parseQtySourceValue,
  qtyBindingKey,
  qtySourceValue,
  resolveQtyBinding,
  type QtyBinding,
} from '@/lib/estimation/qty-bind'
import { groupIncludeState, isLineExcluded, setLineIncluded } from '@/lib/estimation/include'
import type { PropertyCatalogSet } from '@/lib/bim-sql'
import { propertyRefKey, propertyRefLabel, type PropertyRef } from '@/lib/property-tree'
import type { QuantityResult } from '@/lib/geometry-qto'
import { cn } from '@/lib/utils'

const KIND_TONE: Record<CostKind, string> = {
  labor: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
  material: 'bg-amber-500/15 text-amber-800 dark:text-amber-300',
  equipment: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
  subcontractor: 'bg-teal-500/15 text-teal-700 dark:text-teal-300',
  other: 'bg-muted text-muted-foreground',
}

const COLS = 'grid-cols-[2rem_5.5rem_minmax(8rem,1fr)_2rem_minmax(8.5rem,11rem)_4.25rem_3.75rem_3.5rem_5.75rem_6.75rem]'

type AssemblyBuildUpProps = {
  assembly: CostAssembly | null
  elementIds?: number[]
  assemblyQty?: number | null
  quantities?: QuantityResult | null
  propertyCatalog?: PropertyCatalogSet[]
  bindings?: Record<string, QtyBinding>
  excludedLines?: Record<string, boolean>
  onBind?: (rowId: string, binding: QtyBinding) => void
  onExcludedChange?: (excluded: Record<string, boolean>) => void
  measureIfc?: (ref: PropertyRef) => number
  emptyHint?: string
}

export function AssemblyBuildUp({
  assembly,
  elementIds = [],
  assemblyQty,
  quantities = null,
  propertyCatalog = [],
  bindings = {},
  excludedLines = {},
  onBind,
  onExcludedChange,
  measureIfc,
  emptyHint,
}: AssemblyBuildUpProps) {
  if (!assembly) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-[12px] text-muted-foreground">
        {emptyHint ?? 'Select a BOQ line with an assembly to see labour, material and plant.'}
      </div>
    )
  }

  return (
    <AssemblyBuildUpBody
      assembly={assembly}
      elementIds={elementIds}
      assemblyQty={assemblyQty}
      quantities={quantities}
      propertyCatalog={propertyCatalog}
      bindings={bindings}
      excludedLines={excludedLines}
      onBind={onBind}
      onExcludedChange={onExcludedChange}
      measureIfc={measureIfc}
    />
  )
}

function AssemblyBuildUpBody({
  assembly,
  elementIds,
  assemblyQty,
  quantities,
  propertyCatalog,
  bindings,
  excludedLines,
  onBind,
  onExcludedChange,
  measureIfc,
}: {
  assembly: CostAssembly
  elementIds: number[]
  assemblyQty?: number | null
  quantities: QuantityResult | null
  propertyCatalog: PropertyCatalogSet[]
  bindings: Record<string, QtyBinding>
  excludedLines: Record<string, boolean>
  onBind?: (rowId: string, binding: QtyBinding) => void
  onExcludedChange?: (excluded: Record<string, boolean>) => void
  measureIfc?: (ref: PropertyRef) => number
}) {
  const title = englishHint(assembly.description) || displayText(assembly.description)
  const takeoff = assemblyQty != null && Number.isFinite(assemblyQty) ? assemblyQty : null
  const rows = useMemo(() => buildUpRows(assembly.details), [assembly])
  const groupIds = useMemo(() => rows.filter((row) => row.hasChildren).map((row) => row.id), [rows])
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(groupIds))
  const [excludedDraft, setExcludedDraft] = useState<Record<string, boolean> | null>(null)
  const excluded = excludedDraft ?? excludedLines
  const qtyCatalog = useMemo(() => {
    const quantitiesSets = propertyCatalog.filter((group) => group.kind === 'quantity')
    const propertySets = propertyCatalog.filter((group) => group.kind === 'property')
    return [...quantitiesSets, ...propertySets]
  }, [propertyCatalog])

  useEffect(() => {
    setExcludedDraft(null)
  }, [assembly.id])

  useEffect(() => {
    setExpanded(new Set(rows.filter((row) => row.hasChildren).map((row) => row.id)))
  }, [assembly.id, rows])

  const computed = useMemo(() => {
    const qtyById = new Map<string, number>()
    const unitById = new Map<string, string>()
    const grossById = new Map<string, number>()
    const amountById = new Map<string, number>()
    const bindingById = new Map<string, QtyBinding>()
    const excludedById = new Map<string, boolean>()
    const ctx = { ids: elementIds, assemblyQty: takeoff, quantities, measureIfc }
    for (const row of rows) {
      if (row.hasChildren) continue
      const binding = resolveQtyBinding(row, bindings[qtyBindingKey(assembly.id, row.id)])
      bindingById.set(row.id, binding)
      const lineExcluded = isLineExcluded(excluded, assembly.id, row.id)
      excludedById.set(row.id, lineExcluded)
      const measured = measuredLineQty(row, binding, ctx)
      qtyById.set(row.id, measured.qty)
      unitById.set(row.id, measured.unit)
      const gross = computedLineAmount(row, measured.qty)
      grossById.set(row.id, gross)
      amountById.set(row.id, lineExcluded ? 0 : gross)
    }
    for (const row of [...rows].reverse()) {
      if (!row.hasChildren) continue
      const children = rows.filter((child) => child.parentId === row.id)
      const gross = children.reduce((total, child) => total + (grossById.get(child.id) ?? 0), 0)
      const amount = children.reduce((total, child) => total + (amountById.get(child.id) ?? 0), 0)
      grossById.set(row.id, gross)
      amountById.set(row.id, amount)
      qtyById.set(row.id, row.qty ?? 0)
      unitById.set(row.id, row.unit)
      const state = groupIncludeState(rows, excluded, assembly.id, row.id)
      excludedById.set(row.id, state === 'none')
    }
    const kinds: Record<CostKind, number> = { labor: 0, material: 0, equipment: 0, subcontractor: 0, other: 0 }
    let total = 0
    for (const row of rows) {
      if (row.hasChildren) continue
      const amount = amountById.get(row.id) ?? 0
      if (row.kind !== 'group') kinds[row.kind] += amount
      if (row.parentId == null) total += amount
    }
    for (const row of rows) {
      if (row.hasChildren && row.parentId == null) total += amountById.get(row.id) ?? 0
    }
    return { qtyById, unitById, grossById, amountById, bindingById, excludedById, kinds, total }
  }, [assembly.id, rows, bindings, excluded, elementIds, takeoff, quantities, measureIfc])

  const visible = useMemo(() => {
    const hidden = new Set<string>()
    const out: BuildUpRow[] = []
    for (const row of rows) {
      if (row.parentId && hidden.has(row.parentId)) {
        hidden.add(row.id)
        continue
      }
      if (row.parentId && !expanded.has(row.parentId)) {
        hidden.add(row.id)
        continue
      }
      out.push(row)
    }
    return out
  }, [rows, expanded])

  const toggle = (id: string) => {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const setIncluded = (rowId: string, included: boolean) => {
    const next = setLineIncluded(excluded, rows, assembly.id, rowId, included)
    setExcludedDraft(next)
    onExcludedChange?.(next)
  }

  const kindChips: Array<[CostKind, number]> = [
    ['labor', computed.kinds.labor],
    ['material', computed.kinds.material],
    ['equipment', computed.kinds.equipment],
    ['subcontractor', computed.kinds.subcontractor],
    ['other', computed.kinds.other],
  ]

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-border bg-muted/60 px-3 py-1.5">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium">
            <span className="font-mono">{assembly.code}</span>
            <span className="ml-2 font-sans">{title}</span>
          </p>
          <p className="text-[12px] text-muted-foreground">
            {formatAssemblyMoney(assembly.costs, assembly.currency)} / {formatAssemblyUnit(assembly.uom)} catalog
            {takeoff != null ? (
              <>
                <span className="mx-1.5">·</span>
                {formatAssemblyQty(takeoff)} {formatAssemblyUnit(assembly.uom)} in BOQ
              </>
            ) : null}
            <span className="mx-1.5">·</span>
            <span className="font-medium text-foreground">{formatAssemblyMoney(computed.total, assembly.currency)}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          {kindChips.map(([kind, amount]) =>
            amount > 0 ? (
              <span key={kind} className={cn('rounded px-1.5 py-0.5 text-[11px] font-medium', KIND_TONE[kind])}>
                {COST_KIND_LABEL[kind]} {formatAssemblyMoney(amount, assembly.currency)}
              </span>
            ) : null,
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto bg-background px-2 py-1">
        <div className="mb-1 flex items-center gap-2 px-1">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Cost build-up</p>
          <span className="flex-1" />
          <button type="button" className="h-6 px-1.5 text-[12px] text-muted-foreground hover:text-foreground" onClick={() => setExpanded(new Set(groupIds))}>
            Expand
          </button>
          <button type="button" className="h-6 px-1.5 text-[12px] text-muted-foreground hover:text-foreground" onClick={() => setExpanded(new Set())}>
            Collapse
          </button>
        </div>
        <div className={cn('grid px-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground', COLS)}>
          <span />
          <span>Item</span>
          <span>Description</span>
          <span>Type</span>
          <span>Qty from</span>
          <span className="text-right">Qty</span>
          <span className="text-right">Factor</span>
          <span className="text-right">Unit</span>
          <span className="text-right">Rate</span>
          <span className="text-right">Amount</span>
        </div>
        {visible.map((row) => {
          const open = expanded.has(row.id)
          const qty = computed.qtyById.get(row.id)
          const unit = computed.unitById.get(row.id) ?? row.unit
          const gross = computed.grossById.get(row.id)
          const amount = computed.amountById.get(row.id)
          const binding = computed.bindingById.get(row.id)
          const lineOff = computed.excludedById.get(row.id) === true
          const includeState = row.hasChildren
            ? groupIncludeState(rows, excluded, assembly.id, row.id)
            : lineOff
              ? 'none'
              : 'all'
          const muted = lineOff || (row.hasChildren ? row.muted && (amount ?? 0) === 0 : (qty ?? 0) === 0)
          const cells = (
            <>
              <span className="min-w-0 leading-5">
                {row.description}
                {row.note ? <span className="mt-0.5 block text-[11px] font-normal text-muted-foreground">{row.note}</span> : null}
              </span>
              <span>
                {row.kind !== 'group' ? (
                  <span className={cn('inline-flex rounded px-1 text-[11px] font-medium', KIND_TONE[row.kind])}>
                    {COST_KIND_SHORT[row.kind]}
                  </span>
                ) : null}
              </span>
              <span className="min-w-0">
                {row.hasChildren || !binding ? null : (
                  <select
                    className="h-7 w-full max-w-full truncate rounded border border-border bg-card px-1 text-[12px]"
                    value={qtySourceValue(binding)}
                    title="Map this line to a model quantity or property"
                    onClick={(event) => event.stopPropagation()}
                    onChange={(event) => {
                      const next = parseQtySourceValue(event.target.value)
                      if (next) onBind?.(row.id, next)
                    }}
                  >
                    <option value="catalog">Catalog qty</option>
                    <option value="assembly">Assembly qty</option>
                    <optgroup label="Takeoff">
                      {TAKEOFF_QTY_FIELDS.map((item) => (
                        <option key={item.field} value={`takeoff:${item.field}`}>
                          {item.label}
                        </option>
                      ))}
                    </optgroup>
                    {qtyCatalog.map((group) => (
                      <optgroup key={`${group.kind}:${group.set}`} label={group.set}>
                        {group.names.map((name) => {
                          const ref: PropertyRef = { set: group.set, name, kind: group.kind }
                          return (
                            <option key={propertyRefKey(ref)} value={`ifc:${propertyRefKey(ref)}`}>
                              {propertyRefLabel(ref)}
                            </option>
                          )
                        })}
                      </optgroup>
                    ))}
                  </select>
                )}
              </span>
              <span className="text-right tabular-nums">{qty == null || (row.hasChildren && qty === 0) ? '' : formatAssemblyQty(qty)}</span>
              <span className="text-right tabular-nums">{row.factor === 1 && row.hasChildren ? '' : formatAssemblyQty(row.factor)}</span>
              <span className="text-right text-muted-foreground">{unit ? formatAssemblyUnit(unit) : ''}</span>
              <span className="text-right tabular-nums">
                {row.rate == null ? '' : formatAssemblyMoney(row.rate, assembly.currency)}
              </span>
              <span className={cn('text-right font-mono tabular-nums', lineOff && 'text-muted-foreground line-through')}>
                {gross == null ? '' : formatAssemblyMoney(lineOff ? gross : (amount ?? gross), assembly.currency)}
              </span>
            </>
          )
          return (
            <div
              key={row.id}
              className={cn(
                'grid items-center border-t border-border/70 px-1 py-1.5 text-[13px]',
                COLS,
                rowSurface(row),
                row.hasChildren && 'font-medium',
                muted && 'text-muted-foreground',
              )}
            >
              <IncludeTick
                state={includeState}
                title={lineOff ? 'Include in cost' : 'Exclude from cost'}
                onChange={(included) => setIncluded(row.id, included)}
              />
              {row.hasChildren ? (
                <button
                  type="button"
                  className="flex min-w-0 items-center gap-0.5 font-mono text-[12px]"
                  style={{ paddingLeft: row.indent * 10 }}
                  onClick={() => toggle(row.id)}
                >
                  {open ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
                  <span className="truncate" title={row.code}>{row.code}</span>
                </button>
              ) : (
                <span className="truncate font-mono text-[12px]" style={{ paddingLeft: 14 + row.indent * 10 }} title={row.code}>
                  {row.code}
                </span>
              )}
              {cells}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function rowSurface(row: BuildUpRow): string {
  if (!row.hasChildren) return 'bg-card'
  if (row.indent <= 0) return 'bg-muted'
  if (row.indent === 1) return 'bg-secondary'
  return 'bg-accent'
}

function IncludeTick({
  state,
  title,
  onChange,
}: {
  state: 'all' | 'some' | 'none'
  title: string
  onChange: (included: boolean) => void
}) {
  return (
    <button
      type="button"
      title={title}
      className={cn(
        'flex h-6 w-6 items-center justify-center rounded border',
        state === 'none' ? 'border-input bg-card' : 'border-primary bg-primary text-primary-foreground',
      )}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        onChange(state !== 'all')
      }}
    >
      {state === 'all' ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : null}
      {state === 'some' ? <Minus className="h-3.5 w-3.5" strokeWidth={3} /> : null}
    </button>
  )
}
