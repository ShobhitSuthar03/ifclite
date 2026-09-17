import { buildUpRows } from '@/lib/cost-assembly/build-up'
import { rankAssemblies } from '@/lib/cost-assembly/search'
import { displayText, englishHint, type CostAssembly } from '@/lib/cost-assembly/types'
import {
  activeBoq,
  boqLabel,
  findBoqNode,
  flattenBoq,
  mapActiveBoq,
  quantityForIds,
  rebuildBoq,
  setLineIncluded,
  setNodeAssembly,
  type BoqDoc,
  type BoqNode,
  type EstimationDoc,
  type QtyBinding,
} from '@/lib/estimation'
import { parseQtyBinding } from '@/lib/estimation/qty-bind'
import { ATTRIBUTE_IFC_TYPE, parsePropertyRefs } from '@/lib/property-tree'
import { classifyAssemblies, classifyFromHints } from '@/lib/estimator-tools/classify'
import type { EstimatorRuntime } from '@/lib/estimator-tools/runtime'
import { classifySkip } from '@/lib/estimator-tools/skip'
import { TAKEOFF_QTY_FIELDS, measureTakeoff } from '@/lib/estimation/qty-bind'
import type { AreaMetrics } from '@/lib/geometry-qto'
import {
  asBool,
  parsePropertySearch,
  type ViewerAction,
} from '@/lib/estimator-tools/viewer'

export type ToolResult = {
  ok: boolean
  text: string
  data?: Record<string, unknown>
}

function ok(text: string, data?: Record<string, unknown>): ToolResult {
  return { ok: true, text, data }
}

function fail(text: string): ToolResult {
  return { ok: false, text }
}

function sheetOf(runtime: EstimatorRuntime): BoqDoc {
  return activeBoq(runtime.estimation)
}

function patchSheet(runtime: EstimatorRuntime, updater: (boq: BoqDoc) => BoqDoc) {
  runtime.mutate(mapActiveBoq(runtime.estimation, updater))
}

function findSheetWithNode(doc: EstimationDoc, nodeId: string): BoqDoc | null {
  return doc.boqs.find((boq) => findBoqNode(boq.root, nodeId)) ?? null
}

function patchSheetById(runtime: EstimatorRuntime, id: string, updater: (boq: BoqDoc) => BoqDoc) {
  runtime.mutate({
    ...runtime.estimation,
    boqs: runtime.estimation.boqs.map((boq) => (boq.id === id ? updater(boq) : boq)),
  })
}

function boqSummaries(doc: EstimationDoc) {
  return doc.boqs.map((boq) => ({
    id: boq.id,
    name: boqLabel(boq),
    active: boq.id === doc.activeId,
    groupBy: boq.groupBy,
    lineCount: flattenBoq(boq.root).length,
  }))
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function asIds(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is number => typeof item === 'number' && Number.isFinite(item))
}

function assemblyCard(assembly: CostAssembly) {
  return {
    id: assembly.id,
    code: assembly.code,
    description: englishHint(assembly.description) || displayText(assembly.description),
    uom: assembly.uom,
    path: assembly.path,
    labor: assembly.labor,
    material: assembly.material,
    equipment: assembly.equipment,
    subcontractor: assembly.subcontractor,
    other: assembly.other,
    costs: assembly.costs,
    hours: assembly.hours,
  }
}

function boqView(node: BoqNode, runtime: EstimatorRuntime) {
  const assembly = node.assemblyId
    ? runtime.catalog?.assemblies.find((item) => item.id === node.assemblyId)
    : null
  const qty = assembly ? quantityForIds(node.ids, assembly.uom, runtime.quantities) : { qty: node.ids.length, method: 'count' }
  return {
    id: node.id,
    name: node.name,
    kind: node.kind,
    source: node.source,
    ids: node.ids,
    assemblyId: node.assemblyId,
    assemblyCode: assembly?.code ?? null,
    assemblyName: assembly ? englishHint(assembly.description) || displayText(assembly.description) : null,
    uom: assembly?.uom ?? null,
    qty: qty.qty,
    qtyMethod: qty.method,
    amount: assembly ? qty.qty * assembly.costs : 0,
    childCount: node.children.length,
  }
}

function findAssembly(runtime: EstimatorRuntime, id: string | null, code: string | null): CostAssembly | null {
  if (!runtime.catalog) return null
  if (id) {
    const byId = runtime.catalog.assemblies.find((item) => item.id === id)
    if (byId) return byId
  }
  if (code) {
    const needle = code.trim().toLowerCase()
    return runtime.catalog.assemblies.find((item) => item.code.toLowerCase() === needle) ?? null
  }
  return null
}

export async function runEstimatorTool(
  name: string,
  input: Record<string, unknown>,
  runtime: EstimatorRuntime,
): Promise<ToolResult> {
  switch (name) {
    case 'assembly_search':
      return assemblySearch(input, runtime)
    case 'assembly_get':
      return assemblyGet(input, runtime)
    case 'assembly_classify':
      return assemblyClassify(input, runtime)
    case 'estimation_get':
      return estimationGet(input, runtime)
    case 'qto_for_ids':
      return qtoForIds(input, runtime)
    case 'skip_classify':
      return skipClassify(input, runtime)
    case 'estimation_assign_assembly':
      return assignAssembly(input, runtime)
    case 'estimation_set_qty_binding':
      return setQtyBinding(input, runtime)
    case 'estimation_set_included':
      return setIncluded(input, runtime)
    case 'estimation_build_boq':
      return buildBoq(input, runtime)
    case 'estimation_seed_sample':
      return seedSample(input, runtime)
    case 'desktop_select':
      return viewerSelect(input, runtime)
    case 'desktop_isolate':
      return viewerIsolate(input, runtime)
    case 'desktop_show_all':
      return viewerShowAll(runtime)
    case 'property_search':
      return propertySearch(input, runtime)
    default:
      return fail(`Unknown estimator tool: ${name}`)
  }
}

function assemblySearch(input: Record<string, unknown>, runtime: EstimatorRuntime): ToolResult {
  if (!runtime.catalog) return fail('Cost Assembly Store is not loaded.')
  const query = asString(input.query) ?? ''
  const limit = typeof input.limit === 'number' && input.limit > 0 ? Math.min(50, Math.floor(input.limit)) : 15
  const hits = rankAssemblies(runtime.catalog.assemblies, query, limit)
  return ok(`Found ${hits.length} assembl${hits.length === 1 ? 'y' : 'ies'}.`, {
    query,
    total: runtime.catalog.assemblies.length,
    items: hits.map((row) => ({ ...assemblyCard(row.assembly), score: row.score })),
  })
}

function assemblyGet(input: Record<string, unknown>, runtime: EstimatorRuntime): ToolResult {
  const assembly = findAssembly(runtime, asString(input.assembly_id), asString(input.code))
  if (!assembly) return fail('Assembly not found. Pass assembly_id or code from assembly_search.')
  const rows = buildUpRows(assembly.details).map((row) => ({
    id: row.id,
    parentId: row.parentId,
    hasChildren: row.hasChildren,
    indent: row.indent,
    kind: row.kind,
    code: row.code,
    description: row.description,
    qty: row.qty,
    unit: row.unit,
    factor: row.factor,
    extraFactors: row.extraFactors,
    rate: row.rate,
    amount: row.amount,
    muted: row.muted,
    note: row.note ?? null,
  }))
  return ok(`${assembly.code} — ${englishHint(assembly.description) || displayText(assembly.description)}`, {
    assembly: assemblyCard(assembly),
    buildUp: rows,
  })
}

function assemblyClassify(input: Record<string, unknown>, runtime: EstimatorRuntime): ToolResult {
  if (!runtime.catalog) return fail('Cost Assembly Store is not loaded.')
  const ids = asIds(input.ids)
  const ifcType = asString(input.ifc_type) ?? (ids[0] != null ? runtime.hintFor(ids[0]).ifcType : undefined)
  const name = asString(input.name) ?? (ids[0] != null ? runtime.hintFor(ids[0]).name : undefined)
  const query = asString(input.query) ?? ''
  const limit = typeof input.limit === 'number' && input.limit > 0 ? Math.min(20, Math.floor(input.limit)) : 8
  const hints = ids.length > 0 ? ids.map((id) => runtime.hintFor(id)) : [{ id: 0, ifcType, name }]
  const hits =
    ids.length > 0
      ? classifyFromHints(runtime.catalog.assemblies, hints, query, limit)
      : classifyAssemblies(runtime.catalog.assemblies, { ifcType, name, query, limit })
  const skipped = ids.length ? classifySkip(hints) : []
  return ok(
    hits.length
      ? `Suggested ${hits.length} assembl${hits.length === 1 ? 'y' : 'ies'} for ${ifcType || query || 'selection'}.`
      : 'No catalog match. Try assembly_search with a code fragment or empty query to browse.',
    {
      ifcType: ifcType ?? null,
      items: hits.map((row) => ({ ...assemblyCard(row.assembly), score: row.score })),
      skipped: skipped.filter((item) => item.skip),
    },
  )
}

function estimationGet(input: Record<string, unknown>, runtime: EstimatorRuntime): ToolResult {
  const nodeId = asString(input.node_id)
  if (nodeId) {
    const owner = findSheetWithNode(runtime.estimation, nodeId)
    const node = owner ? findBoqNode(owner.root, nodeId) : null
    if (!owner || !node) return fail(`BOQ node not found: ${nodeId}`)
    return ok(node.name, {
      boqId: owner.id,
      boqName: boqLabel(owner),
      node: boqView(node, runtime),
      children: node.children.map((child) => boqView(child, runtime)),
    })
  }
  const sheet = sheetOf(runtime)
  const flat = flattenBoq(sheet.root).map((node) => boqView(node, runtime))
  const name = boqLabel(sheet)
  return ok(`${name}: ${flat.length} BOQ line${flat.length === 1 ? '' : 's'} (${runtime.estimation.boqs.length} BOQ${runtime.estimation.boqs.length === 1 ? '' : 's'}).`, {
    name,
    boqId: sheet.id,
    groupBy: sheet.groupBy,
    selectedIds: runtime.selectedIds,
    boqs: boqSummaries(runtime.estimation),
    nodes: flat,
  })
}

async function qtoForIds(input: Record<string, unknown>, runtime: EstimatorRuntime): Promise<ToolResult> {
  const ids = asIds(input.ids)
  if (ids.length === 0) return fail('Pass ids: number[].')
  const have = new Set(runtime.quantities?.elements.map((element) => element.expressId) ?? [])
  const missing = ids.filter((id) => !have.has(id))
  let computed = false
  if (missing.length > 0) {
    runtime.requestTakeoff(missing)
    if (runtime.ensureQuantities) {
      await runtime.ensureQuantities(missing)
      computed = true
      runtime.clearTakeoff(missing)
    }
  }
  const requested = Array.isArray(input.fields)
    ? input.fields.filter((item): item is string => typeof item === 'string')
    : ['VOLUME', 'LATERALAREA', 'GROSSAREA', 'LENGTH', 'COUNT']
  const allowed = new Set(TAKEOFF_QTY_FIELDS.map((item) => item.field))
  const fields = requested.filter((field): field is keyof AreaMetrics => allowed.has(field as keyof AreaMetrics))
  const metrics: Record<string, number> = {}
  for (const field of fields) {
    metrics[field] = measureTakeoff(ids, field, runtime.quantities)
  }
  const stillMissing = ids.filter(
    (id) => !runtime.quantities?.elements.some((element) => element.expressId === id),
  )
  const zero =
    stillMissing.length === 0 &&
    (metrics.VOLUME === 0 || metrics.VOLUME == null) &&
    (metrics.LATERALAREA === 0 || metrics.LATERALAREA == null)
  return ok(
    stillMissing.length
      ? `Takeoff queued for ${stillMissing.length} id(s) in the desktop viewer. Call qto_for_ids again after a few seconds.`
      : `Takeoff for ${ids.length} id${ids.length === 1 ? '' : 's'}.`,
    {
      ids,
      metrics,
      quantityReady: stillMissing.length === 0,
      computed,
      missingIds: stillMissing,
      hint: zero
        ? 'Mesh takeoff is present but volume/area are 0 — element may be a void or missing tessellation.'
        : stillMissing.length
          ? 'Keep the IFCLite window open so it can measure the selection meshes.'
          : undefined,
    },
  )
}

function skipClassify(input: Record<string, unknown>, runtime: EstimatorRuntime): ToolResult {
  const ids = asIds(input.ids)
  if (ids.length === 0) return fail('Pass ids: number[].')
  const decisions = classifySkip(ids.map((id) => runtime.hintFor(id)))
  const skipped = decisions.filter((item) => item.skip)
  return ok(`${skipped.length} skip, ${decisions.length - skipped.length} calculate.`, { decisions })
}

function assignAssembly(input: Record<string, unknown>, runtime: EstimatorRuntime): ToolResult {
  const nodeId = asString(input.node_id)
  if (!nodeId) return fail('node_id is required.')
  const owner = findSheetWithNode(runtime.estimation, nodeId)
  const node = owner ? findBoqNode(owner.root, nodeId) : null
  if (!owner || !node) return fail(`BOQ node not found: ${nodeId}`)
  const raw = input.assembly_id
  const assemblyId = raw === null || raw === '' ? null : asString(raw)
  if (assemblyId && !findAssembly(runtime, assemblyId, null)) {
    return fail(`Unknown assembly_id: ${assemblyId}`)
  }
  patchSheetById(runtime, owner.id, (boq) => ({
    ...boq,
    root: setNodeAssembly(boq.root, nodeId, assemblyId),
  }))
  return ok(assemblyId ? `Assigned ${assemblyId} to ${node.name}.` : `Cleared assembly on ${node.name}.`, {
    nodeId,
    assemblyId,
    boqId: owner.id,
    revision: runtime.revision,
  })
}

function setQtyBinding(input: Record<string, unknown>, runtime: EstimatorRuntime): ToolResult {
  const assemblyId = asString(input.assembly_id)
  const rowId = asString(input.row_id)
  if (!assemblyId || !rowId) return fail('assembly_id and row_id are required.')
  const binding = parseQtyBinding({
    mode: input.mode,
    field: input.field,
    property: input.property,
  }) as QtyBinding | null
  if (!binding) return fail('Invalid qty binding. Use mode catalog | assembly | takeoff | ifc.')
  const key = `${assemblyId}::${rowId}`
  patchSheet(runtime, (boq) => ({
    ...boq,
    qtyBindings: { ...boq.qtyBindings, [key]: binding },
  }))
  return ok(`Qty binding for ${key} set to ${binding.mode}.`, { key, binding, revision: runtime.revision })
}

function setIncluded(input: Record<string, unknown>, runtime: EstimatorRuntime): ToolResult {
  const assemblyId = asString(input.assembly_id)
  const rowId = asString(input.row_id)
  if (!assemblyId || !rowId) return fail('assembly_id and row_id are required.')
  if (typeof input.included !== 'boolean') return fail('included must be a boolean.')
  const included = input.included
  const assembly = findAssembly(runtime, assemblyId, null)
  if (!assembly) return fail(`Unknown assembly_id: ${assemblyId}`)
  const rows = buildUpRows(assembly.details)
  if (!rows.some((row) => row.id === rowId)) return fail(`Build-up row not found: ${rowId}`)
  patchSheet(runtime, (boq) => ({
    ...boq,
    excludedLines: setLineIncluded(boq.excludedLines, rows, assemblyId, rowId, included),
  }))
  return ok(`${included ? 'Included' : 'Excluded'} ${assemblyId}::${rowId}.`, {
    assemblyId,
    rowId,
    included,
    revision: runtime.revision,
  })
}

function buildBoq(input: Record<string, unknown>, runtime: EstimatorRuntime): ToolResult {
  const groupBy = parsePropertyRefs(input.group_by)
  if (groupBy.length === 0) return fail('group_by must be a non-empty array of property refs.')
  const sheet = sheetOf(runtime)
  const root =
    runtime.previewTree.length > 0 ? rebuildBoq(runtime.previewTree, sheet.root) : sheet.root
  patchSheet(runtime, (boq) => ({ ...boq, groupBy, root }))
  return ok(
    runtime.previewTree.length > 0
      ? `BOQ grouped by ${groupBy.map((ref) => ref.name).join(' / ')}.`
      : `groupBy set to ${groupBy.map((ref) => ref.name).join(' / ')}. The UI will rebuild when the property tree is ready.`,
    { groupBy, boqId: sheet.id, revision: runtime.revision, rebuilt: runtime.previewTree.length > 0 },
  )
}

function seedLeaves(runtime: EstimatorRuntime): BoqNode[] {
  const sheet = sheetOf(runtime)
  if (runtime.previewTree.length > 0) {
    return flattenBoq(rebuildBoq(runtime.previewTree, sheet.root)).filter(
      (node) => node.kind === 'item' && node.ids.length > 0,
    )
  }
  const ids =
    runtime.selectedIds.length > 0
      ? runtime.selectedIds
      : (runtime.quantities?.elements.map((element) => element.expressId) ?? [])
  const buckets = new Map<string, number[]>()
  for (const id of ids) {
    const type = runtime.hintFor(id).ifcType ?? 'IfcProduct'
    const list = buckets.get(type) ?? []
    list.push(id)
    buckets.set(type, list)
  }
  return [...buckets.entries()].map(([name, grouped]) => ({
    id: `p:${name}`,
    name,
    kind: 'item' as const,
    source: 'property' as const,
    ids: grouped,
    assemblyId: null,
    children: [],
  }))
}

async function seedSample(input: Record<string, unknown>, runtime: EstimatorRuntime): Promise<ToolResult> {
  if (!runtime.catalog) return fail('Cost Assembly Store is not loaded.')
  const limitTypes =
    typeof input.limit_types === 'number' && input.limit_types > 0
      ? Math.min(30, Math.floor(input.limit_types))
      : 12
  const leaves = seedLeaves(runtime).slice(0, limitTypes)
  if (leaves.length === 0) {
    return fail(
      'No elements to seed. Isolate or select IFC products first (property_search + desktop_isolate), or group the BOQ by IFC Type and Build. Whole-model takeoff is not supported.',
    )
  }
  let root =
    runtime.previewTree.length > 0
      ? rebuildBoq(runtime.previewTree, sheetOf(runtime).root)
      : leaves
  const assigned: Array<{ nodeId: string; name: string; assemblyId: string; code: string; ids: number[] }> = []
  const skipped: Array<{ nodeId: string; name: string; reason: string }> = []
  const takeoffIds: number[] = []
  for (const leaf of leaves) {
    const decisions = classifySkip(leaf.ids.map((id) => runtime.hintFor(id)))
    const keep = decisions.filter((item) => !item.skip).map((item) => item.id)
    const dropped = decisions.filter((item) => item.skip)
    if (keep.length === 0) {
      skipped.push({
        nodeId: leaf.id,
        name: leaf.name,
        reason: dropped[0]?.reason ?? 'all skipped',
      })
      continue
    }
    const hits = classifyFromHints(
      runtime.catalog.assemblies,
      keep.map((id) => runtime.hintFor(id)),
      '',
      3,
    )
    const top = hits[0]?.assembly
    if (!top) {
      skipped.push({ nodeId: leaf.id, name: leaf.name, reason: 'no catalog match' })
      continue
    }
    root = setNodeAssembly(root, leaf.id, top.id)
    assigned.push({ nodeId: leaf.id, name: leaf.name, assemblyId: top.id, code: top.code, ids: keep })
    takeoffIds.push(...keep)
  }
  patchSheet(runtime, (boq) => ({
    ...boq,
    name: !boq.name.trim() || /^BOQ \d+$/i.test(boq.name.trim()) ? 'Sample BOQ' : boq.name,
    groupBy: boq.groupBy.length > 0 ? boq.groupBy : [ATTRIBUTE_IFC_TYPE],
    root,
  }))
  if (takeoffIds.length > 0) {
    runtime.requestTakeoff(takeoffIds)
    if (runtime.ensureQuantities) {
      await runtime.ensureQuantities(takeoffIds)
      runtime.clearTakeoff(takeoffIds)
    }
  }
  return ok(
    `Sample BOQ: ${assigned.length} assembl${assigned.length === 1 ? 'y' : 'ies'} assigned, ${skipped.length} skipped, takeoff ${takeoffIds.length} element${takeoffIds.length === 1 ? '' : 's'}.`,
    {
      assigned,
      skipped,
      takeoffIds,
      revision: runtime.revision,
    },
  )
}

function uniqueIds(ids: number[]): number[] {
  return [...new Set(ids.filter((id) => Number.isFinite(id)))]
}

async function applyViewer(runtime: EstimatorRuntime, action: ViewerAction): Promise<void> {
  runtime.enqueueViewer(action)
  if (action.kind === 'select') {
    runtime.selectedIds = action.additive ? uniqueIds([...runtime.selectedIds, ...action.ids]) : uniqueIds(action.ids)
  } else if (action.kind === 'isolate') {
    runtime.selectedIds = uniqueIds(action.ids)
  }
  if (runtime.applyViewer) await runtime.applyViewer(action)
}

async function viewerSelect(input: Record<string, unknown>, runtime: EstimatorRuntime): Promise<ToolResult> {
  const ids = uniqueIds(asIds(input.ids))
  if (ids.length === 0) return fail('Pass ids: number[].')
  await applyViewer(runtime, { kind: 'select', ids, additive: asBool(input.additive, false) })
  return ok(`Selected ${ids.length} element${ids.length === 1 ? '' : 's'}.`, { ids, selectedIds: runtime.selectedIds })
}

async function viewerIsolate(input: Record<string, unknown>, runtime: EstimatorRuntime): Promise<ToolResult> {
  const ids = uniqueIds(asIds(input.ids).length ? asIds(input.ids) : runtime.selectedIds)
  if (ids.length === 0) return fail('Pass ids or select elements first.')
  const mode = input.mode === 'ghost' ? 'ghost' : 'isolate'
  await applyViewer(runtime, { kind: 'isolate', ids, mode })
  await applyViewer(runtime, { kind: 'fit' })
  return ok(`Isolated ${ids.length} element${ids.length === 1 ? '' : 's'} (${mode}).`, {
    ids,
    mode,
    selectedIds: runtime.selectedIds,
  })
}

async function viewerShowAll(runtime: EstimatorRuntime): Promise<ToolResult> {
  await applyViewer(runtime, { kind: 'show_all' })
  return ok('Showing the whole model.')
}

async function waitForSearch(runtime: EstimatorRuntime) {
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    if (runtime.searchResults && !runtime.pendingSearch) return runtime.searchResults
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  return null
}

async function propertySearch(input: Record<string, unknown>, runtime: EstimatorRuntime): Promise<ToolResult> {
  const parsed = parsePropertySearch(input)
  if ('error' in parsed) return fail(parsed.error)
  const result = runtime.searchElements
    ? await runtime.searchElements(parsed)
    : (runtime.requestSearch(parsed), await waitForSearch(runtime))
  if (!result) {
    return fail('Property search timed out waiting for the desktop viewer. Keep IFCLite open.')
  }
  if (parsed.isolate && result.ids.length > 0) {
    await applyViewer(runtime, { kind: 'isolate', ids: result.ids, mode: 'isolate' })
    await applyViewer(runtime, { kind: 'fit' })
  } else if (parsed.select && result.ids.length > 0) {
    await applyViewer(runtime, { kind: 'select', ids: result.ids, additive: false })
  }
  return ok(
    result.ids.length
      ? `Found ${result.ids.length} element${result.ids.length === 1 ? '' : 's'}${result.truncated ? ' (truncated)' : ''}.`
      : 'No elements matched.',
    {
      ids: result.ids,
      hits: result.hits,
      truncated: result.truncated,
      isolated: parsed.isolate,
      selected: parsed.select || parsed.isolate,
    },
  )
}
