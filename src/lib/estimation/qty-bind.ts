import type { BuildUpRow } from '@/lib/cost-assembly/build-up'
import type { CostKind } from '@/lib/cost-assembly/types'
import type { AreaMetrics, QuantityResult } from '@/lib/geometry-qto'
import { quantityForIds } from '@/lib/estimation/qty'
import { propertyRefKey, type PropertyRef } from '@/lib/property-tree'

export type QtyBinding =
  | { mode: 'catalog' }
  | { mode: 'assembly' }
  | { mode: 'takeoff'; field: keyof AreaMetrics }
  | { mode: 'ifc'; property: PropertyRef }

export const TAKEOFF_QTY_FIELDS: Array<{ field: keyof AreaMetrics; label: string; unit: string }> = [
  { field: 'VOLUME', label: 'Volume', unit: 'm³' },
  { field: 'LATERALAREA', label: 'Lateral area', unit: 'm²' },
  { field: 'GROSSAREA', label: 'Gross area', unit: 'm²' },
  { field: 'AREAMAX', label: 'Max area', unit: 'm²' },
  { field: 'UNDERAREA', label: 'Soffit area', unit: 'm²' },
  { field: 'TOPAREA', label: 'Top area', unit: 'm²' },
  { field: 'FOOTPRINTAREA', label: 'Footprint', unit: 'm²' },
  { field: 'COVEREDAREA', label: 'Covered area', unit: 'm²' },
  { field: 'LENGTH', label: 'Length', unit: 'm' },
  { field: 'WIDTH', label: 'Width', unit: 'm' },
  { field: 'HEIGHT', label: 'Height', unit: 'm' },
  { field: 'COUNT', label: 'Count', unit: 'nr' },
]

const TAKEOFF_FIELD_SET = new Set(TAKEOFF_QTY_FIELDS.map((item) => item.field))

export function qtyBindingKey(assemblyId: string, rowId: string): string {
  return `${assemblyId}::${rowId}`
}

export function parseQtyBindings(value: unknown): Record<string, QtyBinding> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const out: Record<string, QtyBinding> = {}
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (!key) continue
    const binding = parseQtyBinding(item)
    if (binding) out[key] = binding
  }
  return out
}

export function parseQtyBinding(value: unknown): QtyBinding | null {
  if (!value || typeof value !== 'object') return null
  const row = value as { mode?: unknown; field?: unknown; property?: unknown }
  if (row.mode === 'catalog') return { mode: 'catalog' }
  if (row.mode === 'assembly') return { mode: 'assembly' }
  if (row.mode === 'takeoff' && typeof row.field === 'string' && isTakeoffField(row.field)) {
    return { mode: 'takeoff', field: row.field }
  }
  if (row.mode === 'ifc') {
    const property = parseBindingProperty(row.property)
    if (property) return { mode: 'ifc', property }
  }
  return null
}

export function suggestQtyBinding(row: BuildUpRow): QtyBinding {
  if (row.hasChildren) return { mode: 'catalog' }
  const hay = `${row.code} ${row.description} ${row.note ?? ''} ${row.unit}`.toLowerCase()
  const unit = row.unit.toLowerCase().replace(/³/g, '3').replace(/²/g, '2')
  if (/soffit|underarea|plafond|onderside/.test(hay)) return { mode: 'takeoff', field: 'UNDERAREA' }
  if (/top ?area|toparea/.test(hay)) return { mode: 'takeoff', field: 'TOPAREA' }
  if (/formwork|formwor|bekist|schalung|lateral/.test(hay)) return { mode: 'takeoff', field: 'LATERALAREA' }
  if (/beton|concrete|\bvolume\b/.test(hay) || /\bm3\b/.test(unit)) return { mode: 'takeoff', field: 'VOLUME' }
  if (/\bm2\b/.test(unit) || /\bm2\b/.test(hay)) return { mode: 'takeoff', field: 'LATERALAREA' }
  if (/length|lengte|\blm\b/.test(hay) || unit === 'm' || unit === 'lm') return { mode: 'takeoff', field: 'LENGTH' }
  if (row.kind === 'labor') return { mode: 'assembly' }
  return { mode: 'catalog' }
}

export function resolveQtyBinding(row: BuildUpRow, stored: QtyBinding | undefined): QtyBinding {
  if (stored) return stored
  return suggestQtyBinding(row)
}

export function takeoffFieldMeta(field: keyof AreaMetrics): { field: keyof AreaMetrics; label: string; unit: string } {
  return TAKEOFF_QTY_FIELDS.find((item) => item.field === field) ?? { field, label: String(field), unit: '' }
}

export function qtyBindingLabel(binding: QtyBinding): string {
  if (binding.mode === 'catalog') return 'Catalog qty'
  if (binding.mode === 'assembly') return 'Assembly qty'
  if (binding.mode === 'takeoff') return takeoffFieldMeta(binding.field).label
  return binding.property.name
}

export function qtySourceValue(binding: QtyBinding): string {
  if (binding.mode === 'catalog') return 'catalog'
  if (binding.mode === 'assembly') return 'assembly'
  if (binding.mode === 'takeoff') return `takeoff:${binding.field}`
  return `ifc:${propertyRefKey(binding.property)}`
}

export function parseQtySourceValue(value: string): QtyBinding | null {
  if (value === 'catalog') return { mode: 'catalog' }
  if (value === 'assembly') return { mode: 'assembly' }
  if (value.startsWith('takeoff:')) {
    const field = value.slice('takeoff:'.length)
    if (isTakeoffField(field)) return { mode: 'takeoff', field }
    return null
  }
  if (value.startsWith('ifc:')) {
    const property = parsePropertyKey(value.slice('ifc:'.length))
    if (property) return { mode: 'ifc', property }
  }
  return null
}

export function measureTakeoff(
  ids: number[],
  field: keyof AreaMetrics,
  quantities: QuantityResult | null,
): number {
  if (ids.length === 0) return 0
  if (field === 'COUNT') return ids.length
  if (!quantities) return 0
  const byId = new Map(quantities.elements.map((element) => [element.expressId, element]))
  let sum = 0
  for (const id of ids) {
    const element = byId.get(id)
    if (!element) continue
    sum += element.metrics[field] ?? 0
  }
  return sum
}

export type QtyMeasureContext = {
  ids: number[]
  assemblyQty: number | null
  quantities: QuantityResult | null
  measureIfc?: (ref: PropertyRef) => number
}

export function measuredLineQty(
  row: BuildUpRow,
  binding: QtyBinding,
  ctx: QtyMeasureContext,
): { qty: number; unit: string } {
  const catalogQty = row.qty ?? 0
  if (binding.mode === 'catalog') return { qty: catalogQty, unit: row.unit }
  if (binding.mode === 'assembly') {
    const assemblyQty = ctx.assemblyQty != null && Number.isFinite(ctx.assemblyQty) ? ctx.assemblyQty : 0
    return { qty: assemblyQty * catalogQty, unit: row.unit }
  }
  if (binding.mode === 'takeoff') {
    const meta = takeoffFieldMeta(binding.field)
    return { qty: measureTakeoff(ctx.ids, binding.field, ctx.quantities), unit: meta.unit || row.unit }
  }
  return { qty: ctx.measureIfc?.(binding.property) ?? 0, unit: row.unit }
}

export function computedLineAmount(row: BuildUpRow, qty: number): number {
  if (row.hasChildren || row.rate == null) return 0
  return qty * row.factor * row.extraFactors * row.rate
}

export type ElementBuildUpLine = {
  rowId: string
  code: string
  description: string
  kind: CostKind | 'group'
  qty: number
  unit: string
  amount: number
  takeoffField: keyof AreaMetrics | null
}

export type ElementBuildUp = {
  expressId: number
  lines: ElementBuildUpLine[]
  total: number
  volume: number
  formwork: number
  measured: boolean
}

export function elementBuildUps(input: {
  rows: BuildUpRow[]
  ids: number[]
  assemblyId: string
  assemblyUom: string
  bindings: Record<string, QtyBinding>
  excluded: Record<string, boolean>
  quantities: QuantityResult | null
  measureIfc?: (ids: number[], ref: PropertyRef) => number
  shareCount?: number
}): ElementBuildUp[] {
  const { rows, ids, assemblyId, assemblyUom, bindings, excluded, quantities, measureIfc } = input
  const leaves = rows.filter((row) => !row.hasChildren)
  const share = Math.max(input.shareCount ?? ids.length, 1)
  return ids.map((expressId) => {
    const one = [expressId]
    const assemblyQty = quantityForIds(one, assemblyUom, quantities).qty
    const qto = quantities?.elements.find((item) => item.expressId === expressId) ?? null
    const ctx: QtyMeasureContext = {
      ids: one,
      assemblyQty,
      quantities,
      measureIfc: (ref) => measureIfc?.(one, ref) ?? 0,
    }
    const lines: ElementBuildUpLine[] = []
    let total = 0
    let formwork = qto?.metrics.LATERALAREA ?? 0
    for (const row of leaves) {
      const binding = resolveQtyBinding(row, bindings[qtyBindingKey(assemblyId, row.id)])
      const measured =
        binding.mode === 'catalog'
          ? { qty: (row.qty ?? 0) / share, unit: row.unit }
          : measuredLineQty(row, binding, ctx)
      const lineExcluded = Boolean(excluded[qtyBindingKey(assemblyId, row.id)])
      const gross = computedLineAmount(row, measured.qty)
      const amount = lineExcluded ? 0 : gross
      if (binding.mode === 'takeoff' && binding.field === 'LATERALAREA') formwork = measured.qty
      lines.push({
        rowId: row.id,
        code: row.code,
        description: row.description,
        kind: row.kind,
        qty: measured.qty,
        unit: measured.unit,
        amount,
        takeoffField: binding.mode === 'takeoff' ? binding.field : null,
      })
      total += amount
    }
    return {
      expressId,
      lines,
      total,
      volume: qto?.metrics.VOLUME ?? 0,
      formwork,
      measured: qto != null,
    }
  })
}

function isTakeoffField(value: string): value is keyof AreaMetrics {
  return TAKEOFF_FIELD_SET.has(value as keyof AreaMetrics)
}

function parseBindingProperty(value: unknown): PropertyRef | null {
  if (!value || typeof value !== 'object') return null
  const row = value as { set?: unknown; name?: unknown; kind?: unknown }
  const set = typeof row.set === 'string' ? row.set : ''
  const name = typeof row.name === 'string' ? row.name.trim() : ''
  if (!name) return null
  if (row.kind !== 'property' && row.kind !== 'quantity') return null
  return { set, name, kind: row.kind }
}

function parsePropertyKey(value: string): PropertyRef | null {
  const colon = value.indexOf(':')
  if (colon <= 0) return null
  const kind = value.slice(0, colon)
  const rest = value.slice(colon + 1)
  const dot = rest.lastIndexOf('.')
  if (dot <= 0) return null
  if (kind !== 'property' && kind !== 'quantity') return null
  const set = rest.slice(0, dot)
  const name = rest.slice(dot + 1).trim()
  if (!name) return null
  return { set, name, kind }
}
