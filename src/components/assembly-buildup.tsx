import { useEffect, useMemo, useState } from 'react'
import { Check, ChevronDown, ChevronRight, ExternalLink, Minus, X } from 'lucide-react'
import type { CostAssembly, CostKind } from '@/lib/cost-assembly/types'
import { displayText, englishHint } from '@/lib/cost-assembly/types'
import { COST_KIND_LABEL, COST_KIND_SHORT, formatAssemblyMoney, formatAssemblyQty, formatAssemblyUnit } from '@/lib/cost-assembly/search'
import { buildUpRows, type BuildUpRow } from '@/lib/cost-assembly/build-up'
import { ancestorMultipliers, evaluatedRowQty } from '@/lib/cost-assembly/evaluate'
import { displayParameterValue, makeParameterResolver } from '@/lib/cost-assembly/params'
import {
  TAKEOFF_QTY_FIELDS,
  computedLineAmount,
  measureTakeoff,
  measuredLineQty,
  parseQtySourceValue,
  qtyBindingKey,
  qtySourceValue,
  resolveQtyBinding,
  type QtyBinding,
} from '@/lib/estimation/qty-bind'
import {
  buildMeasuredParams,
  isLiveQuantityParameter,
  paramBindingKey,
  paramSourceValue,
  parseParamSourceValue,
  resolveParamBinding,
  withCombine,
  type ParamBinding,
} from '@/lib/estimation/param-bind'
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
  parameterOverrides?: Record<string, string>
  parameterBindings?: Record<string, ParamBinding>
  onBind?: (rowId: string, binding: QtyBinding) => void
  onExcludedChange?: (excluded: Record<string, boolean>) => void
  onParameterOverrideChange?: (code: string, value: string) => void
  onParamBindingChange?: (code: string, binding: ParamBinding) => void
  measureIfc?: (ref: PropertyRef) => number
  emptyHint?: string
  onClose?: () => void
  /** Shows a "pop out" button that detaches this panel into its own window (multi-monitor). */
  onPopOut?: () => void
}

export function AssemblyBuildUp({
  assembly,
  elementIds = [],
  assemblyQty,
  quantities = null,
  propertyCatalog = [],
  bindings = {},
  excludedLines = {},
  parameterOverrides = {},
  parameterBindings = {},
  onBind,
  onExcludedChange,
  onParameterOverrideChange,
  onParamBindingChange,
  measureIfc,
  emptyHint,
  onClose,
  onPopOut,
}: AssemblyBuildUpProps) {
  if (!assembly) {
    return (
      <div className="flex h-full flex-col">
        {onClose ? <BuildUpCloseBar onClose={onClose} /> : null}
        <div className="flex flex-1 items-center justify-center px-4 text-[12px] text-muted-foreground">
          {emptyHint ?? 'Select a BOQ line with an assembly to see labour, material and plant.'}
        </div>
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
      parameterOverrides={parameterOverrides}
      parameterBindings={parameterBindings}
      onBind={onBind}
      onExcludedChange={onExcludedChange}
      onParameterOverrideChange={onParameterOverrideChange}
      onParamBindingChange={onParamBindingChange}
      measureIfc={measureIfc}
      onClose={onClose}
      onPopOut={onPopOut}
    />
  )
}

function BuildUpCloseBar({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex h-8 shrink-0 items-center justify-between gap-2 border-b border-border bg-muted/60 px-2">
      <span className="text-[11px] font-medium">Assembly</span>
      <button
        type="button"
        className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
        title="Hide assembly"
        onClick={onClose}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
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
  parameterOverrides,
  parameterBindings,
  onBind,
  onExcludedChange,
  onParameterOverrideChange,
  onParamBindingChange,
  measureIfc,
  onClose,
  onPopOut,
}: {
  assembly: CostAssembly
  elementIds: number[]
  assemblyQty?: number | null
  quantities: QuantityResult | null
  propertyCatalog: PropertyCatalogSet[]
  bindings: Record<string, QtyBinding>
  excludedLines: Record<string, boolean>
  parameterOverrides: Record<string, string>
  parameterBindings: Record<string, ParamBinding>
  onBind?: (rowId: string, binding: QtyBinding) => void
  onExcludedChange?: (excluded: Record<string, boolean>) => void
  onParameterOverrideChange?: (code: string, value: string) => void
  onParamBindingChange?: (code: string, binding: ParamBinding) => void
  measureIfc?: (ref: PropertyRef) => number
  onClose?: () => void
  onPopOut?: () => void
}) {
  const title = englishHint(assembly.description) || displayText(assembly.description)
  const takeoff = assemblyQty != null && Number.isFinite(assemblyQty) ? assemblyQty : null
  const rows = useMemo(() => buildUpRows(assembly.details), [assembly])
  // "_LVMenge" means "the real bound quantity" - not something a person types in here.
  const editableParameters = useMemo(
    () => assembly.parameters.filter((parameter) => !isLiveQuantityParameter(parameter)),
    [assembly.parameters],
  )
  const groupIds = useMemo(() => rows.filter((row) => row.hasChildren).map((row) => row.id), [rows])
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(groupIds))
  const [parametersOpen, setParametersOpen] = useState(false)
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

  const measuredParams = useMemo(
    () =>
      buildMeasuredParams(
        assembly.parameters,
        parameterBindings,
        assembly.id,
        elementIds,
        (ids, field) => measureTakeoff(ids, field, quantities),
        measureIfc ? (_ids, ref) => measureIfc(ref) : undefined,
        propertyCatalog,
      ),
    [assembly, parameterBindings, elementIds, quantities, measureIfc, propertyCatalog],
  )
  const resolve = useMemo(
    () => makeParameterResolver(assembly, parameterOverrides, takeoff, measuredParams),
    [assembly, parameterOverrides, takeoff, measuredParams],
  )
  const multipliers = useMemo(() => ancestorMultipliers(rows, resolve), [rows, resolve])

  const computed = useMemo(() => {
    const qtyById = new Map<string, number>()
    const unitById = new Map<string, string>()
    const grossById = new Map<string, number>()
    const amountById = new Map<string, number>()
    const bindingById = new Map<string, QtyBinding>()
    const excludedById = new Map<string, boolean>()
    const ctx = { ids: elementIds, assemblyQty: takeoff, quantities, measureIfc, resolve }
    for (const row of rows) {
      if (row.hasChildren) continue
      const binding = resolveQtyBinding(row, bindings[qtyBindingKey(assembly.id, row.id)])
      bindingById.set(row.id, binding)
      const lineExcluded = isLineExcluded(excluded, assembly.id, row.id)
      excludedById.set(row.id, lineExcluded)
      const measured = measuredLineQty(row, binding, ctx)
      qtyById.set(row.id, measured.qty)
      unitById.set(row.id, measured.unit)
      const ancestorMultiplier = multipliers.get(row.id) ?? 1
      const gross = computedLineAmount(row, measured.qty) * ancestorMultiplier
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
      qtyById.set(row.id, evaluatedRowQty(row, resolve))
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
  }, [assembly.id, rows, bindings, excluded, elementIds, takeoff, quantities, measureIfc, resolve, multipliers])

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
        {onPopOut || onClose ? (
          <div className="ml-auto flex shrink-0 items-center gap-1">
            {onPopOut ? (
              <button
                type="button"
                className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
                title="Move to another window (drag it to a second monitor)"
                onClick={onPopOut}
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </button>
            ) : null}
            {onClose ? (
              <button
                type="button"
                className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
                title="Hide assembly"
                onClick={onClose}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      {editableParameters.length > 0 ? (
        <div className="shrink-0 border-b border-border px-3 py-1">
          <button
            type="button"
            className="flex items-center gap-1 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground"
            onClick={() => setParametersOpen((value) => !value)}
          >
            {parametersOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            Parameters ({editableParameters.length})
          </button>
          {parametersOpen ? (
          <div className="mt-1 space-y-1 pb-1">
            {editableParameters.map((parameter) => {
              const stored = parameterBindings[paramBindingKey(assembly.id, parameter.code)]
              const binding = resolveParamBinding(parameter, stored, propertyCatalog)
              const label = englishHint([{ language: 'en', value: parameter.description }]) || parameter.code
              const canAverage = elementIds.length > 1
              return (
                <div key={parameter.code} className="flex flex-wrap items-center gap-1.5 text-[11px]">
                  <span className="w-32 shrink-0 truncate text-muted-foreground" title={label}>
                    {label}
                  </span>
                  <select
                    className="h-6 max-w-[11rem] shrink-0 rounded border border-border bg-card px-1 text-[11px]"
                    value={paramSourceValue(binding)}
                    title="Where this value comes from - model data first, manual only as a last resort"
                    onChange={(event) => {
                      const source = parseParamSourceValue(event.target.value)
                      if (!source) return
                      const combine = binding.mode !== 'manual' ? binding.combine : 'sum'
                      onParamBindingChange?.(parameter.code, withCombine(source, combine))
                    }}
                  >
                    <option value="manual">Manual value</option>
                    <optgroup label="From geometry">
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
                  {binding.mode !== 'manual' && canAverage ? (
                    <select
                      className="h-6 shrink-0 rounded border border-border bg-card px-1 text-[11px]"
                      value={binding.combine}
                      title="Sum across all objects on this line, or average per object"
                      onChange={(event) =>
                        onParamBindingChange?.(parameter.code, {
                          ...binding,
                          combine: event.target.value === 'average' ? 'average' : 'sum',
                        })
                      }
                    >
                      <option value="sum">Sum</option>
                      <option value="average">Average</option>
                    </select>
                  ) : null}
                  {binding.mode === 'manual' ? (
                    <input
                      className="h-6 w-20 shrink-0 rounded border border-border bg-card px-1 font-mono text-[11px]"
                      defaultValue={displayParameterValue(parameter, parameterOverrides, assembly.id)}
                      key={`${assembly.id}-${parameter.code}-${displayParameterValue(parameter, parameterOverrides, assembly.id)}`}
                      onBlur={(event) => onParameterOverrideChange?.(parameter.code, event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') event.currentTarget.blur()
                      }}
                    />
                  ) : (
                    <span className="font-mono text-[11px] tabular-nums" title="Measured from the model">
                      {formatAssemblyQty(resolve(parameter.code))}
                    </span>
                  )}
                  {parameter.unit ? <span className="text-muted-foreground">{formatAssemblyUnit(parameter.unit)}</span> : null}
                </div>
              )
            })}
          </div>
          ) : null}
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-auto bg-background px-2 py-1">
        <div className="mb-1 flex items-center gap-2 px-1">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Cost items</p>
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
