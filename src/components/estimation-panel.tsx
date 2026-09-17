import { useEffect, useMemo, useRef, useState } from 'react'
import { Calculator, ChevronDown, ChevronRight, Eye, FileSpreadsheet, FileUp, ListTree, Plus, Search, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { CostAssembly, CostAssemblyCatalog } from '@/lib/cost-assembly/types'
import { displayText, englishHint } from '@/lib/cost-assembly/types'
import { formatAssemblyMoney, formatAssemblyQty, formatAssemblyUnit } from '@/lib/cost-assembly/search'
import {
  activeBoq,
  addBoq,
  applyImportedBoq,
  addChildNode,
  boqLabel,
  createManualHeading,
  createManualItem,
  defaultManualName,
  findBoqNode,
  flattenBoq,
  lineMatchValue,
  mapActiveBoq,
  parseBoqCsv,
  parseBoqXml,
  pickBoqCsvFile,
  pickBoqXmlFile,
  quantityForIds,
  removeBoq,
  removeBoqNode,
  renameBoqNode,
  rollupAmount,
  selectBoq,
  setNodeAssembly,
  setNodeMatch,
  type BoqDoc,
  type BoqNode,
  type EstimationDoc,
} from '@/lib/estimation'
import { groupingCatalog, type PropertyCatalogSet } from '@/lib/bim-sql'
import { linkPropertyOptions } from '@/lib/cost-assembly/links'
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
import { missingTakeoffIds, type TakeoffProgress } from '@/lib/takeoff-scope'
import { cn, formatCount } from '@/lib/utils'

type EstimationPanelProps = {
  doc: EstimationDoc
  previewTree: PropertyTreeNode[]
  catalog: CostAssemblyCatalog | null
  propertyCatalog: PropertyCatalogSet[]
  quantities: QuantityResult | null
  quantityBusy?: boolean
  takeoffProgress?: TakeoffProgress | null
  selectedIds: Set<number>
  selectedId: string | null
  hint?: string | null
  onChange: (doc: EstimationDoc) => void
  onSelect: (node: BoqNode | null) => void
  onBuild: () => void
  bindReady?: boolean
  onBind?: (boq: BoqDoc) => { boq: BoqDoc; mappedLines: number; mappedElements: number }
  onShow: (ids: number[]) => void
  onCalculateTakeoff?: (ids: number[]) => void
  onCancelTakeoff?: () => void
  onClosePane?: () => void
}

export function EstimationPanel({
  doc,
  previewTree,
  catalog,
  propertyCatalog,
  quantities,
  quantityBusy = false,
  takeoffProgress = null,
  selectedIds,
  selectedId,
  hint,
  onChange,
  onSelect,
  onBuild,
  onBind,
  onShow,
  onCalculateTakeoff,
  onCancelTakeoff,
  onClosePane,
}: EstimationPanelProps) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const [nameDraft, setNameDraft] = useState('')
  const [importHint, setImportHint] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
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
  const takeoffIds = useMemo(() => {
    if (selectedIds.size > 0) return [...selectedIds]
    return selected?.ids ?? []
  }, [selected?.ids, selectedIds])
  const takeoffMissing = useMemo(
    () => missingTakeoffIds(takeoffIds, quantities?.elements.map((item) => item.expressId) ?? []),
    [quantities, takeoffIds],
  )

  const changeSheet = (updater: (boq: BoqDoc) => BoqDoc) => onChange(mapActiveBoq(doc, updater))
  const setGroupBy = (groupBy: typeof sheet.groupBy) => changeSheet((boq) => ({ ...boq, groupBy }))

  const applyBind = (next: BoqDoc) => {
    if (!onBind) {
      changeSheet(() => next)
      return { boq: next, mappedLines: 0, mappedElements: 0 }
    }
    const bound = onBind(next)
    changeSheet(() => bound.boq)
    return bound
  }

  const mapElements = () => {
    if (!sheet.linkProperty && !flattenBoq(sheet.root).some((node) => node.matchProperty)) {
      setImportHint('Pick a model property first. Each BOQ line uses its MatchKey / value against that property.')
      return
    }
    const bound = applyBind(sheet)
    const ids = flattenBoq(bound.boq.root)
      .filter((node) => node.children.length === 0)
      .flatMap((node) => node.ids)
    if (ids.length > 0) onShow(ids)
    setImportHint(
      bound.mappedLines
        ? `Mapped ${bound.mappedLines} line${bound.mappedLines === 1 ? '' : 's'} → ${formatCount(bound.mappedElements)} elements`
        : 'No elements matched. Check the property (ObjectType, Tag, classification) and each line’s value.',
    )
  }

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

  const importBoq = async (kind: 'xml' | 'csv') => {
    const file = kind === 'xml' ? await pickBoqXmlFile() : await pickBoqCsvFile()
    if (!file) return
    setImporting(true)
    try {
      const assemblies = catalog?.assemblies
      const result = kind === 'xml' ? parseBoqXml(file.bytes, file.name, assemblies) : parseBoqCsv(file.bytes, file.name, assemblies)
      onChange(applyImportedBoq(doc, result.boq))
      onSelect(null)
      setImportHint(
        `Imported ${result.itemCount} item${result.itemCount === 1 ? '' : 's'} from ${file.name}. Pick a property, then Map — each line’s MatchKey is the value.`,
      )
    } catch (caught) {
      setImportHint(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setImporting(false)
    }
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
      <div className="flex h-8 shrink-0 items-center gap-1 border-b border-border bg-muted/40 px-2">
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
        {onClosePane ? (
          <button
            type="button"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
            title="Hide BOQ"
            onClick={onClosePane}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
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

      <div className="relative z-20 flex shrink-0 flex-wrap items-center gap-1.5 overflow-visible border-b border-border px-3 py-1.5">
        {sheet.groupBy.map((rule, index) => (
          <span
            key={`${propertyRefKey(rule)}-${index}`}
            className="flex h-7 shrink-0 items-center gap-1 rounded border border-border bg-muted/40 px-1.5 text-[11px]"
          >
            <span className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
              {index === 0 ? 'Group' : 'Then'}
            </span>
            <span className="max-w-[9rem] truncate">{propertyRefLabel(rule)}</span>
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
          key={`${sheet.id}-group`}
          catalog={propertyCatalog}
          rules={sheet.groupBy}
          disabled={sheet.groupBy.length >= MAX_FILTER_RULES}
          placeholder="Search properties"
          onPick={(ref) => setGroupBy(addFilterRule(sheet.groupBy, ref))}
        />
        <Button
          size="sm"
          className="h-7 shrink-0 px-2 text-[11px]"
          disabled={sheet.groupBy.length === 0 || previewTree.length === 0}
          onClick={onBuild}
        >
          Build
        </Button>
        <span className="mx-1 h-4 w-px shrink-0 bg-border" />
        {sheet.linkProperty ? (
          <span className="flex h-7 shrink-0 items-center gap-1 rounded border border-border bg-muted/40 px-1.5 text-[11px]">
            <span className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">Link</span>
            <span className="max-w-[9rem] truncate">{propertyRefLabel(sheet.linkProperty)}</span>
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => changeSheet((boq) => ({ ...boq, linkProperty: null }))}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ) : null}
        <GroupingPropertySearch
          key={`${sheet.id}-link`}
          catalog={linkPropertyOptions(propertyCatalog)}
          rules={[]}
          disabled={false}
          placeholder="Search property to map…"
          wide
          onPick={(ref) => {
            const bound = applyBind({ ...sheet, linkProperty: ref })
            const ids = flattenBoq(bound.boq.root)
              .filter((node) => node.children.length === 0)
              .flatMap((node) => node.ids)
            if (ids.length > 0) onShow(ids)
            setImportHint(
              bound.mappedLines
                ? `Mapped ${bound.mappedLines} line${bound.mappedLines === 1 ? '' : 's'} → ${formatCount(bound.mappedElements)} elements via ${propertyRefLabel(ref)}`
                : `No elements matched ${propertyRefLabel(ref)}. Check each line’s value, then Map.`,
            )
          }}
        />
        <Button
          size="sm"
          className="h-7 shrink-0 px-2 text-[11px]"
          title="Assign IFC elements whose property equals each line’s MatchKey / value"
          onClick={mapElements}
        >
          Map
        </Button>
      </div>
      <div className="flex shrink-0 flex-nowrap items-center gap-1.5 overflow-x-auto border-b border-border px-3 py-1.5">
        <input
          className="h-7 w-40 shrink-0 rounded border border-border bg-background px-2 text-[11px] outline-none"
          placeholder="New heading / item"
          value={nameDraft}
          onChange={(event) => setNameDraft(event.target.value)}
        />
        <Button size="sm" variant="outline" className="h-7 shrink-0 px-2 text-[11px]" onClick={addHeading}>
          <Plus className="h-3 w-3" />
          Heading
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 shrink-0 px-2 text-[11px]"
          disabled={selectedIds.size === 0}
          onClick={addItem}
        >
          <Plus className="h-3 w-3" />
          Item · {formatCount(selectedIds.size)}
        </Button>
        <span className="flex-1" />
        <Button
          size="sm"
          variant="outline"
          className="h-7 shrink-0 px-2 text-[11px]"
          disabled={importing}
          title="Import iTWO Element Planning XML"
          onClick={() => void importBoq('xml')}
        >
          <FileUp className="h-3 w-3" />
          XML
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 shrink-0 px-2 text-[11px]"
          disabled={importing}
          title="Import BOQ CSV template"
          onClick={() => void importBoq('csv')}
        >
          <FileSpreadsheet className="h-3 w-3" />
          CSV
        </Button>
      </div>
      {onCalculateTakeoff ? (
        <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-border px-3 py-1.5">
          <Calculator className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="text-[11px] text-muted-foreground">
            {takeoffIds.length === 0
              ? 'Select a BOQ line or 3D elements to calculate quantities.'
              : quantityBusy && takeoffProgress
                ? `Calculating ${takeoffProgress.done} / ${takeoffProgress.total}`
                : takeoffMissing.length > 0
                  ? `${formatCount(takeoffIds.length)} selected · ${formatCount(takeoffMissing.length)} need QTO`
                  : `${formatCount(takeoffIds.length)} selected · quantities ready`}
          </span>
          <span className="flex-1" />
          {quantityBusy ? (
            <Button size="sm" variant="outline" className="h-7 shrink-0 px-2 text-[11px]" onClick={onCancelTakeoff}>
              Stop
            </Button>
          ) : (
            <Button
              size="sm"
              className="h-7 shrink-0 px-2 text-[11px]"
              disabled={takeoffMissing.length === 0}
              title="Measure volume, area, and formwork for the current selection without leaving Estimation"
              onClick={() => onCalculateTakeoff(takeoffIds)}
            >
              <Calculator className="h-3 w-3" />
              Calculate · {formatCount(takeoffMissing.length)}
            </Button>
          )}
        </div>
      ) : null}
      {hint ? <p className="shrink-0 border-b border-border px-3 py-1 text-[11px] text-muted-foreground">{hint}</p> : null}
      {importHint ? (
        <p className="shrink-0 border-b border-border px-3 py-1 text-[11px] text-muted-foreground">{importHint}</p>
      ) : null}

      {sheet.root.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-1 px-6 text-center text-[12px] text-muted-foreground">
          <ListTree className="h-5 w-5" />
          <p className="font-medium text-foreground">{boqLabel(sheet)} is empty</p>
          <p>
            Grouping builds a live tree from IFC properties. Import XML/CSV, pick a link property, then Map so each
            line’s MatchKey selects matching elements.
          </p>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full table-fixed border-collapse text-[12px]">
            <thead className="sticky top-0 z-10 bg-card">
              <tr className="border-b border-border text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                <th className="w-[4.25rem] px-2 py-1.5 text-left font-medium">Code</th>
                <th className="px-2 py-1.5 text-left font-medium">Description</th>
                <th className="w-[7.5rem] px-2 py-1.5 text-left font-medium">Value</th>
                <th className="w-[3.25rem] px-2 py-1.5 text-right font-medium">El.</th>
                <th className="w-[10rem] px-2 py-1.5 text-left font-medium">Assembly</th>
                <th className="w-[4.25rem] px-2 py-1.5 text-right font-medium">Qty</th>
                <th className="w-[3rem] px-2 py-1.5 text-right font-medium">Unit</th>
                <th className="w-[5.25rem] px-2 py-1.5 text-right font-medium">Rate</th>
                <th className="w-[5.75rem] px-2 py-1.5 text-right font-medium">Amount</th>
                <th className="w-[5.5rem] px-1 py-1.5 text-right font-medium" />
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
                const matchValue = lineMatchValue(node)
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
                    <td className="overflow-hidden px-2 py-0">
                      <div className="flex h-8 items-center" style={{ paddingLeft: depth * 12 }}>
                        {node.children.length > 0 ? (
                          <button
                            type="button"
                            className="mr-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
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
                        <span className="truncate font-mono text-[10px] font-normal text-muted-foreground">
                          {node.code ?? ''}
                        </span>
                      </div>
                    </td>
                    <td className="overflow-hidden px-2 py-0">
                      {node.source !== 'property' && active ? (
                        <input
                          className="h-7 w-full rounded border border-border bg-background px-1 text-[12px] outline-none"
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
                        <span className="block truncate leading-8">{node.name}</span>
                      )}
                    </td>
                    <td className="overflow-hidden px-2 py-0">
                      {heading ? (
                        <span />
                      ) : node.source === 'import' && active ? (
                        <input
                          className="h-7 w-full rounded border border-border bg-background px-1 font-mono text-[11px] outline-none"
                          value={node.matchValue ?? node.assemblyCode ?? ''}
                          placeholder="Match value"
                          title="IFC property value for this line"
                          onClick={(event) => event.stopPropagation()}
                          onChange={(event) =>
                            changeSheet((boq) => ({
                              ...boq,
                              root: setNodeMatch(boq.root, node.id, { matchValue: event.target.value }),
                            }))
                          }
                          onBlur={(event) => {
                            applyBind({
                              ...sheet,
                              root: setNodeMatch(sheet.root, node.id, { matchValue: event.currentTarget.value }),
                            })
                          }}
                        />
                      ) : (
                        <span className="block truncate font-mono text-[11px] font-normal leading-8 text-muted-foreground">
                          {matchValue}
                        </span>
                      )}
                    </td>
                    <td className="px-2 text-right font-mono text-[11px] tabular-nums leading-8 text-muted-foreground">
                      {formatCount(node.ids.length)}
                    </td>
                    <td className="overflow-hidden px-2 py-0">
                      {heading && !node.assemblyId ? (
                        <span />
                      ) : (
                        <select
                          className="h-7 w-full rounded border border-border bg-background px-1 text-[11px] font-normal"
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
                    <td className="px-2 text-right font-mono text-[12px] tabular-nums leading-8">
                      {heading && !assembly ? '' : formatAssemblyQty(line.qty)}
                    </td>
                    <td className="px-2 text-right text-[11px] leading-8 text-muted-foreground">
                      {assembly ? formatAssemblyUnit(assembly.uom) : heading ? '' : 'nr'}
                    </td>
                    <td className="px-2 text-right font-mono text-[12px] tabular-nums leading-8">
                      {assembly ? formatAssemblyMoney(assembly.costs, assembly.currency || currency) : ''}
                    </td>
                    <td className="px-2 text-right font-mono text-[12px] tabular-nums leading-8">
                      {amount > 0 ? formatAssemblyMoney(amount, currency) : heading ? '' : '—'}
                    </td>
                    <td className="px-1 py-0">
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
                        {onCalculateTakeoff ? (
                          <button
                            type="button"
                            className={cn(
                              'flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground',
                              node.ids.length === 0 && 'invisible',
                            )}
                            title="Calculate quantities for this line"
                            disabled={node.ids.length === 0 || quantityBusy}
                            onClick={(event) => {
                              event.stopPropagation()
                              onSelect(node)
                              onShow(node.ids)
                              onCalculateTakeoff(node.ids)
                            }}
                          >
                            <Calculator className="h-3.5 w-3.5" />
                          </button>
                        ) : null}
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
                <td className="px-2 py-1.5 text-[11px] font-medium" colSpan={8}>
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

function GroupingPropertySearch({
  catalog,
  rules,
  disabled,
  placeholder,
  wide,
  onPick,
}: {
  catalog: PropertyCatalogSet[]
  rules: PropertyRef[]
  disabled: boolean
  placeholder?: string
  wide?: boolean
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
    <div className="relative z-30" ref={rootRef}>
      <label className="relative block">
        <Search className="pointer-events-none absolute top-2 left-2 h-3.5 w-3.5 text-muted-foreground" />
        <input
          className={cn(
            'h-7 rounded border border-border bg-background py-0 pr-2 pl-7 text-[11px] outline-none disabled:opacity-50',
            wide ? 'w-64' : 'w-48',
          )}
          disabled={disabled}
          value={search}
          placeholder={disabled ? 'Grouping full' : placeholder || 'Search properties'}
          aria-label={placeholder || 'Search properties'}
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
        <div className="absolute top-8 left-0 z-50 max-h-72 w-80 overflow-auto rounded border border-border bg-card py-1 shadow-lg">
          {groups.length === 0 ? (
            <p className="px-2.5 py-3 text-[11px] text-muted-foreground italic">
              {catalog.length === 0 && !search.trim()
                ? 'No IFC properties yet. ObjectType, Tag, Name and IFC Type are listed when the model is indexed.'
                : 'No properties match that search.'}
            </p>
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
