import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, Eye, ListTree, Plus, Search, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { CostAssembly, CostAssemblyCatalog } from '@/lib/cost-assembly/types'
import { displayText, englishHint } from '@/lib/cost-assembly/types'
import { formatAssemblyMoney, formatAssemblyQty, formatAssemblyUnit } from '@/lib/cost-assembly/search'
import {
  activeBoq,
  addBoq,
  addChildNode,
  boqLabel,
  createManualHeading,
  createManualItem,
  defaultManualName,
  findBoqNode,
  flattenBoq,
  mapActiveBoq,
  quantityForIds,
  removeBoq,
  removeBoqNode,
  renameBoqNode,
  rollupAmount,
  selectBoq,
  setNodeAssembly,
  type BoqDoc,
  type BoqNode,
  type EstimationDoc,
} from '@/lib/estimation'
import { groupingCatalog, type PropertyCatalogSet } from '@/lib/bim-sql'
import {
  addFilterRule,
  MAX_FILTER_RULES,
  propertyRefKey,
  propertyRefLabel,
  removeFilterRule,
  samePropertyRef,
  type PropertyRef,
  type PropertyTreeNode,
} from '@/lib/property-tree'
import type { QuantityResult } from '@/lib/geometry-qto'
import { cn, formatCount } from '@/lib/utils'

type EstimationPanelProps = {
  doc: EstimationDoc
  previewTree: PropertyTreeNode[]
  catalog: CostAssemblyCatalog | null
  propertyCatalog: PropertyCatalogSet[]
  quantities: QuantityResult | null
  selectedIds: Set<number>
  selectedId: string | null
  hint?: string | null
  onChange: (doc: EstimationDoc) => void
  onSelect: (node: BoqNode | null) => void
  onBuild: () => void
  onShow: (ids: number[]) => void
}

export function EstimationPanel({
  doc,
  previewTree,
  catalog,
  propertyCatalog,
  quantities,
  selectedIds,
  selectedId,
  hint,
  onChange,
  onSelect,
  onBuild,
  onShow,
}: EstimationPanelProps) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const [nameDraft, setNameDraft] = useState('')
  const sheet = activeBoq(doc)
  const structureKey = useMemo(
    () => `${sheet.id}:${flattenBoq(sheet.root).map((node) => node.id).join('|')}`,
    [sheet.id, sheet.root],
  )
  useEffect(() => {
    setExpanded(new Set(flattenBoq(sheet.root).filter((node) => node.children.length > 0).map((node) => node.id)))
  }, [structureKey, sheet.root])

  const selected = findBoqNode(sheet.root, selectedId)
  const currency = catalog?.assemblies[0]?.currency ?? 'EUR'
  const byId = useMemo(() => new Map((catalog?.assemblies ?? []).map((item) => [item.id, item])), [catalog])
  const assemblyGroups = useMemo(() => groupedAssemblies(catalog), [catalog])
  const leafCount = useMemo(() => countLeaves(sheet.root), [sheet.root])
  const total = useMemo(
    () => sheet.root.reduce((sum, node) => sum + rollupAmount(node, (item) => lineAmount(item, byId, quantities)), 0),
    [sheet.root, byId, quantities],
  )
  const rows = useMemo(() => visibleBoqRows(sheet.root, expanded), [sheet.root, expanded])

  const changeSheet = (updater: (boq: BoqDoc) => BoqDoc) => onChange(mapActiveBoq(doc, updater))
  const setGroupBy = (groupBy: typeof sheet.groupBy) => changeSheet((boq) => ({ ...boq, groupBy }))

  const addItem = () => {
    const item = createManualItem(nameDraft || defaultManualName(sheet.root, 'item'), selectedIds)
    if (!item) return
    const parentId = selected?.kind === 'heading' ? selected.id : null
    changeSheet((boq) => ({ ...boq, root: addChildNode(boq.root, parentId, item) }))
    setNameDraft('')
    onSelect(item)
    onShow(item.ids)
  }

  const addHeading = () => {
    const heading = createManualHeading(nameDraft || defaultManualName(sheet.root, 'heading'))
    if (!heading) return
    const parentId = selected?.kind === 'heading' ? selected.id : null
    changeSheet((boq) => ({ ...boq, root: addChildNode(boq.root, parentId, heading) }))
    setNameDraft('')
    onSelect(heading)
  }

  const toggle = (id: string) => {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex h-8 shrink-0 items-center gap-1 border-b border-border px-2">
        <div className="flex min-w-0 flex-1 items-end gap-0.5 overflow-x-auto">
          {doc.boqs.map((boq) => {
            const selectedSheet = boq.id === sheet.id
            return (
              <button
                key={boq.id}
                type="button"
                className={cn(
                  'group flex h-7 max-w-[12rem] shrink-0 items-center gap-1 rounded-t border border-b-0 px-2 text-[11px]',
                  selectedSheet
                    ? 'border-border bg-background font-medium text-foreground'
                    : 'border-transparent text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
                title={boqLabel(boq)}
                onClick={() => {
                  if (selectedSheet) return
                  onChange(selectBoq(doc, boq.id))
                  onSelect(null)
                }}
              >
                <span className="truncate">{boqLabel(boq)}</span>
                {doc.boqs.length > 1 ? (
                  <span
                    role="button"
                    tabIndex={-1}
                    className="rounded p-0.5 text-muted-foreground opacity-0 hover:bg-accent hover:text-destructive group-hover:opacity-100"
                    aria-label={`Close ${boqLabel(boq)}`}
                    onClick={(event) => {
                      event.stopPropagation()
                      onChange(removeBoq(doc, boq.id))
                      onSelect(null)
                    }}
                  >
                    <X className="h-3 w-3" />
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 shrink-0 px-2 text-[11px]"
          title="New BOQ"
          onClick={() => {
            onChange(addBoq(doc))
            onSelect(null)
          }}
        >
          <Plus className="h-3.5 w-3.5" />
          New BOQ
        </Button>
      </div>

      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-3">
        <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Name</span>
        <input
          className="h-7 min-w-0 flex-1 rounded border border-border bg-background px-2 text-[13px] font-medium outline-none"
          value={sheet.name}
          placeholder="Untitled BOQ"
          aria-label="BOQ name"
          onChange={(event) => changeSheet((boq) => ({ ...boq, name: event.target.value }))}
          onBlur={() => {
            const name = sheet.name.trim()
            if (name !== sheet.name) changeSheet((boq) => ({ ...boq, name }))
          }}
        />
        <span className="font-mono text-[11px] text-muted-foreground">{formatCount(leafCount)} items</span>
        <span className="text-[11px] text-muted-foreground">Total</span>
        <span className="font-mono text-[13px] font-medium tabular-nums">{formatAssemblyMoney(total, currency)}</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-[11px] text-muted-foreground hover:text-destructive"
          disabled={doc.boqs.length === 1 && sheet.root.length === 0 && sheet.groupBy.length === 0}
          title="Delete this BOQ"
          onClick={() => {
            onChange(removeBoq(doc, sheet.id))
            onSelect(null)
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete BOQ
        </Button>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-border px-3 py-1.5">
        {sheet.groupBy.map((rule, index) => (
          <span
            key={`${propertyRefKey(rule)}-${index}`}
            className="flex h-7 items-center gap-1 rounded border border-border bg-muted/40 px-1.5 text-[11px]"
          >
            <span className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
              {index === 0 ? 'Group' : 'Then'}
            </span>
            <span className="max-w-[10rem] truncate">{propertyRefLabel(rule)}</span>
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => setGroupBy(removeFilterRule(sheet.groupBy, rule))}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <GroupingPropertySearch
          key={sheet.id}
          catalog={propertyCatalog}
          rules={sheet.groupBy}
          disabled={sheet.groupBy.length >= MAX_FILTER_RULES}
          onPick={(ref) => setGroupBy(addFilterRule(sheet.groupBy, ref))}
        />
        <Button
          size="sm"
          className="h-7 px-2 text-[11px]"
          disabled={sheet.groupBy.length === 0 || previewTree.length === 0}
          onClick={onBuild}
        >
          Build
        </Button>
        {previewTree.length > 0 ? (
          <span className="text-[10px] text-muted-foreground">{formatCount(previewCount(previewTree))} groups</span>
        ) : null}
        <span className="flex-1" />
        <input
          className="h-7 w-36 rounded border border-border bg-background px-2 text-[11px] outline-none"
          placeholder="New heading / item"
          value={nameDraft}
          onChange={(event) => setNameDraft(event.target.value)}
        />
        <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={addHeading}>
          <Plus className="h-3 w-3" />
          Heading
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2 text-[11px]"
          disabled={selectedIds.size === 0}
          onClick={addItem}
        >
          <Plus className="h-3 w-3" />
          Item · {formatCount(selectedIds.size)}
        </Button>
      </div>
      {hint ? <p className="shrink-0 border-b border-border px-3 py-1 text-[11px] text-muted-foreground">{hint}</p> : null}

      {sheet.root.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-1 px-6 text-center text-[12px] text-muted-foreground">
          <ListTree className="h-5 w-5" />
          <p className="font-medium text-foreground">{boqLabel(sheet)} is empty</p>
          <p>
            Grouping on this tab applies only to this BOQ. Search a property, then Build. Or add a heading and drop a 3D
            selection onto an item.
          </p>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full table-fixed border-collapse text-[12px]">
            <thead className="sticky top-0 z-10 bg-card">
              <tr className="border-b border-border text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-1.5 text-left font-medium">Description</th>
                <th className="w-[11rem] px-2 py-1.5 text-left font-medium">Assembly</th>
                <th className="w-[4.5rem] px-2 py-1.5 text-right font-medium">Qty</th>
                <th className="w-[3.25rem] px-2 py-1.5 text-right font-medium">Unit</th>
                <th className="w-[5.75rem] px-2 py-1.5 text-right font-medium">Rate</th>
                <th className="w-[6.5rem] px-2 py-1.5 text-right font-medium">Amount</th>
                <th className="w-[4.5rem] px-2 py-1.5 text-right font-medium" />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ node, depth }) => {
                const assembly = node.assemblyId ? byId.get(node.assemblyId) : undefined
                const heading = node.children.length > 0 || node.kind === 'heading'
                const line = assembly
                  ? quantityForIds(node.ids, assembly.uom, quantities)
                  : { qty: node.ids.length, method: 'count' as const }
                const amount = rollupAmount(node, (item) => lineAmount(item, byId, quantities))
                const open = expanded.has(node.id)
                const active = selectedId === node.id
                return (
                  <tr
                    key={node.id}
                    className={cn(
                      'group cursor-pointer border-b border-border/70',
                      heading ? 'bg-muted/35 font-medium' : 'hover:bg-accent/60',
                      active && 'bg-primary/10 hover:bg-primary/10',
                    )}
                    onClick={() => {
                      onSelect(node)
                      if (node.ids.length > 0) onShow(node.ids)
                    }}
                  >
                    <td className="px-3 py-0">
                      <div className="flex h-8 min-w-0 items-center gap-1" style={{ paddingLeft: depth * 14 }}>
                        {node.children.length > 0 ? (
                          <button
                            type="button"
                            className="flex h-5 w-5 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
                            onClick={(event) => {
                              event.stopPropagation()
                              toggle(node.id)
                            }}
                          >
                            {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                          </button>
                        ) : (
                          <span className="w-5 shrink-0" />
                        )}
                        {node.source === 'manual' && active ? (
                          <input
                            className="h-6 min-w-0 flex-1 rounded border border-border bg-background px-1 text-[12px] outline-none"
                            value={node.name}
                            onClick={(event) => event.stopPropagation()}
                            onChange={(event) =>
                              changeSheet((boq) => ({
                                ...boq,
                                root: renameBoqNode(boq.root, node.id, event.target.value),
                              }))
                            }
                          />
                        ) : (
                          <span className="min-w-0 truncate">{node.name}</span>
                        )}
                        <span className="shrink-0 font-mono text-[10px] font-normal text-muted-foreground">
                          {formatCount(node.ids.length)}
                        </span>
                      </div>
                    </td>
                    <td className="px-2 py-0">
                      {heading && !node.assemblyId ? (
                        <span className="text-[11px] text-muted-foreground" />
                      ) : (
                        <select
                          className="h-7 w-full max-w-[11rem] rounded border border-border bg-background px-1 text-[11px] font-normal"
                          value={node.assemblyId ?? ''}
                          onClick={(event) => event.stopPropagation()}
                          onChange={(event) => {
                            changeSheet((boq) => ({
                              ...boq,
                              root: setNodeAssembly(boq.root, node.id, event.target.value || null),
                            }))
                            onSelect(node)
                          }}
                        >
                          <option value="">Assign…</option>
                          {assemblyGroups.map((group) => (
                            <optgroup key={group.label} label={group.label}>
                              {group.items.map((item) => (
                                <option key={item.id} value={item.id}>
                                  {item.code} · {englishHint(item.description) || displayText(item.description)}
                                </option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className="px-2 text-right font-mono text-[12px] tabular-nums">
                      {heading && !assembly ? '' : formatAssemblyQty(line.qty)}
                    </td>
                    <td className="px-2 text-right text-[11px] text-muted-foreground">
                      {assembly ? formatAssemblyUnit(assembly.uom) : heading ? '' : 'nr'}
                    </td>
                    <td className="px-2 text-right font-mono text-[12px] tabular-nums">
                      {assembly ? formatAssemblyMoney(assembly.costs, assembly.currency || currency) : ''}
                    </td>
                    <td className="px-2 text-right font-mono text-[12px] tabular-nums">
                      {amount > 0 ? formatAssemblyMoney(amount, currency) : heading ? '' : '—'}
                    </td>
                    <td className="px-2 py-0">
                      <div
                        className={cn(
                          'flex h-8 items-center justify-end gap-0.5',
                          active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
                        )}
                      >
                        <button
                          type="button"
                          className={cn(
                            'flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground',
                            node.ids.length === 0 && 'invisible',
                          )}
                          title="Show in 3D"
                          disabled={node.ids.length === 0}
                          onClick={(event) => {
                            event.stopPropagation()
                            onSelect(node)
                            onShow(node.ids)
                          }}
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-destructive"
                          title="Remove"
                          onClick={(event) => {
                            event.stopPropagation()
                            changeSheet((boq) => ({ ...boq, root: removeBoqNode(boq.root, node.id) }))
                            if (selectedId === node.id) onSelect(null)
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot className="sticky bottom-0 bg-card">
              <tr className="border-t border-border">
                <td className="px-3 py-1.5 text-[11px] font-medium" colSpan={5}>
                  Total
                </td>
                <td className="px-2 py-1.5 text-right font-mono text-[12px] font-medium tabular-nums">
                  {formatAssemblyMoney(total, currency)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}

function visibleBoqRows(
  nodes: BoqNode[],
  expanded: Set<string>,
  depth = 0,
): Array<{ node: BoqNode; depth: number }> {
  const rows: Array<{ node: BoqNode; depth: number }> = []
  for (const node of nodes) {
    rows.push({ node, depth })
    if (node.children.length > 0 && expanded.has(node.id)) {
      rows.push(...visibleBoqRows(node.children, expanded, depth + 1))
    }
  }
  return rows
}

function groupedAssemblies(catalog: CostAssemblyCatalog | null): Array<{ label: string; items: CostAssembly[] }> {
  if (!catalog) return []
  const map = new Map<string, CostAssembly[]>()
  for (const item of catalog.assemblies) {
    const label = item.path[0] || item.category || 'Assemblies'
    const list = map.get(label)
    if (list) list.push(item)
    else map.set(label, [item])
  }
  return [...map.entries()].map(([label, items]) => ({ label, items }))
}

function lineAmount(node: BoqNode, byId: Map<string, CostAssembly>, quantities: QuantityResult | null): number {
  if (!node.assemblyId) return 0
  const assembly = byId.get(node.assemblyId)
  if (!assembly) return 0
  return quantityForIds(node.ids, assembly.uom, quantities).qty * assembly.costs
}

function countLeaves(nodes: BoqNode[]): number {
  let count = 0
  const walk = (node: BoqNode) => {
    if (node.children.length === 0) count += 1
    for (const child of node.children) walk(child)
  }
  for (const node of nodes) walk(node)
  return count
}

function previewCount(nodes: PropertyTreeNode[]): number {
  let count = 0
  const walk = (node: PropertyTreeNode) => {
    if (node.children.length === 0) count += 1
    for (const child of node.children) walk(child)
  }
  for (const node of nodes) walk(node)
  return count
}

function GroupingPropertySearch({
  catalog,
  rules,
  disabled,
  onPick,
}: {
  catalog: PropertyCatalogSet[]
  rules: PropertyRef[]
  disabled: boolean
  onPick: (ref: PropertyRef) => void
}) {
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const groups = useMemo(() => {
    const filtered = groupingCatalog(catalog, search)
    return filtered
      .map((group) => ({
        ...group,
        names: group.names.filter((name) => {
          const ref: PropertyRef = { set: group.set, name, kind: group.kind }
          return !rules.some((rule) => samePropertyRef(rule, ref))
        }),
      }))
      .filter((group) => group.names.length > 0)
  }, [catalog, rules, search])
  const first = groups[0]
    ? { set: groups[0].set, name: groups[0].names[0], kind: groups[0].kind }
    : null

  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    window.addEventListener('pointerdown', onPointer)
    return () => window.removeEventListener('pointerdown', onPointer)
  }, [open])

  const pick = (ref: PropertyRef) => {
    onPick(ref)
    setSearch('')
    setOpen(false)
  }

  return (
    <div className="relative" ref={rootRef}>
      <label className="relative block">
        <Search className="pointer-events-none absolute top-2 left-2 h-3.5 w-3.5 text-muted-foreground" />
        <input
          className="h-7 w-48 rounded border border-border bg-background py-0 pr-2 pl-7 text-[11px] outline-none disabled:opacity-50"
          disabled={disabled}
          value={search}
          placeholder={disabled ? 'Grouping full' : 'Search properties'}
          aria-label="Search grouping properties"
          onFocus={() => {
            if (!disabled) setOpen(true)
          }}
          onChange={(event) => {
            setSearch(event.target.value)
            if (!disabled) setOpen(true)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              setOpen(false)
              return
            }
            if (event.key === 'Enter' && first) {
              event.preventDefault()
              pick(first)
            }
          }}
        />
      </label>
      {open && !disabled ? (
        <div className="absolute top-8 left-0 z-20 max-h-56 w-72 overflow-auto rounded border border-border bg-card py-1 shadow-md">
          {groups.length === 0 ? (
            <p className="px-2.5 py-3 text-[11px] text-muted-foreground italic">No properties match.</p>
          ) : (
            groups.map((group) => (
              <div key={`${group.kind}:${group.set}`}>
                <p className="px-2.5 py-1 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                  {group.set}
                </p>
                {group.names.map((name) => {
                  const ref: PropertyRef = { set: group.set, name, kind: group.kind }
                  return (
                    <button
                      key={propertyRefKey(ref)}
                      type="button"
                      className="flex w-full px-2.5 py-1 text-left text-[12px] hover:bg-accent"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => pick(ref)}
                    >
                      <span className="truncate">{name}</span>
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  )
}
