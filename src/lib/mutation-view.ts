import {
  extractEntityAttributesOnDemand,
  extractPropertiesOnDemand,
  extractQuantitiesOnDemand,
  type IfcDataStore,
} from '@ifc-lite/parser'
import { MutablePropertyView, type PropertyExtractor, type QuantityExtractor } from '@ifc-lite/mutations'
import { PropertyValueType, QuantityType, type PropertyValue, type QuantitySet } from '@ifc-lite/data'
import type { EntityData } from '@/lib/ifc-data'
import { all, type BimDatabase } from '@/lib/bim-sql/database'

export function createMutationView(store: IfcDataStore): MutablePropertyView {
  const view = new MutablePropertyView(null, 'model')
  view.setOnDemandExtractor((entityId) => extractPropertiesOnDemand(store, entityId))
  view.setQuantityExtractor(
    (entityId) => extractQuantitiesOnDemand(store, entityId) as unknown as QuantitySet[],
  )
  view.setAttributeExtractor((entityId, attrName) => {
    const attrs = extractEntityAttributesOnDemand(store, entityId)
    const key = attrName.toLowerCase()
    if (key === 'name') return attrs.name || store.entities.getName(entityId) || null
    if (key === 'description') return attrs.description ?? null
    if (key === 'objecttype') return attrs.objectType ?? null
    if (key === 'tag') return attrs.tag ?? null
    if (key === 'globalid') return attrs.globalId ?? null
    return null
  })
  return view
}

function inferQuantityType(unit: string | null | undefined): QuantityType {
  if (!unit) return QuantityType.Number
  if (unit.includes('³')) return QuantityType.Volume
  if (unit.includes('²')) return QuantityType.Area
  const lower = unit.toLowerCase()
  if (lower === 'm' || lower === 'mm' || lower === 'ft' || lower === 'in') return QuantityType.Length
  if (lower.includes('kg') || lower.includes('ton') || lower === 't') return QuantityType.Weight
  return QuantityType.Number
}

function warehousePropertyExtractor(db: BimDatabase): PropertyExtractor {
  return (entityId) => {
    const rows = all<{ pset: string; name: string; value: string | null }>(
      db,
      'SELECT pset, name, value FROM element_properties WHERE express_id = ? ORDER BY pset, name',
      [entityId],
    )
    const sets = new Map<string, { name: string; properties: Array<{ name: string; type: number; value: unknown }> }>()
    for (const row of rows) {
      const set = sets.get(row.pset) ?? { name: row.pset, properties: [] }
      set.properties.push({ name: row.name, type: PropertyValueType.String, value: row.value })
      sets.set(row.pset, set)
    }
    return [...sets.values()]
  }
}

function warehouseQuantityExtractor(db: BimDatabase): QuantityExtractor {
  return (entityId) => {
    const rows = all<{ qset: string; name: string; value: number | null; unit: string | null }>(
      db,
      'SELECT qset, name, value, unit FROM quantities WHERE express_id = ? ORDER BY qset, name',
      [entityId],
    )
    const sets = new Map<string, QuantitySet>()
    for (const row of rows) {
      const set = sets.get(row.qset) ?? { name: row.qset, quantities: [] }
      set.quantities.push({
        name: row.name,
        type: inferQuantityType(row.unit),
        value: row.value ?? 0,
        unit: row.unit ?? undefined,
      })
      sets.set(row.qset, set)
    }
    return [...sets.values()]
  }
}

/**
 * Warehouse-backed counterpart to createMutationView: a project reopened from
 * warehouse.sqlite has no live IfcDataStore (that's the whole point of skipping
 * re-parse), so property/attribute edits need their "base" values read from the
 * warehouse instead. Without this, MutablePropertyView had no base data source in
 * that mode, and overlaying its (empty) output onto an entity's properties would
 * have replaced the warehouse's real property sets with just the edited ones.
 */
export function createWarehouseMutationView(db: BimDatabase): MutablePropertyView {
  const view = new MutablePropertyView(null, 'model')
  view.setOnDemandExtractor(warehousePropertyExtractor(db))
  view.setQuantityExtractor(warehouseQuantityExtractor(db))
  view.setAttributeExtractor((entityId, attrName) => {
    const row = all<{
      global_id: string | null
      name: string | null
      description: string | null
      object_type: string | null
      tag: string | null
    }>(
      db,
      'SELECT global_id, name, description, object_type, tag FROM elements WHERE express_id = ? LIMIT 1',
      [entityId],
    )[0]
    if (!row) return null
    const key = attrName.toLowerCase()
    if (key === 'name') return row.name ?? null
    if (key === 'description') return row.description ?? null
    if (key === 'objecttype') return row.object_type ?? null
    if (key === 'tag') return row.tag ?? null
    if (key === 'globalid') return row.global_id ?? null
    return null
  })
  return view
}

function formatProp(value: PropertyValue): string {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(4)
  if (Array.isArray(value)) return value.map((item) => formatProp(item)).join(', ')
  return String(value)
}

export function overlayEntityData(entity: EntityData, view: MutablePropertyView): EntityData {
  const attrs = Object.fromEntries(
    view.getAttributeMutationsForEntity(entity.expressId).map((item) => [item.name.toLowerCase(), item.value]),
  )
  const propertySets = view.getForEntity(entity.expressId).map((set) => ({
    name: set.name,
    properties: set.properties.map((property) => ({
      name: property.name,
      value: formatProp(property.value),
    })),
  }))
  const quantitySets = view.getQuantitiesForEntity(entity.expressId).map((set) => ({
    name: set.name,
    quantities: set.quantities.map((quantity) => ({
      name: quantity.name,
      value: quantity.value.toFixed(3),
    })),
  }))
  return {
    ...entity,
    name: attrs.name ?? entity.name,
    description: attrs.description ?? entity.description,
    objectType: attrs.objecttype ?? entity.objectType,
    tag: attrs.tag ?? entity.tag,
    propertySets,
    quantitySets: quantitySets.length > 0 ? quantitySets : entity.quantitySets,
  }
}
