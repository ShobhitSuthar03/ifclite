import {
  extractEntityAttributesOnDemand,
  extractPropertiesOnDemand,
  extractQuantitiesOnDemand,
  type IfcDataStore,
} from '@ifc-lite/parser'
import { MutablePropertyView } from '@ifc-lite/mutations'
import type { PropertyValue, QuantitySet } from '@ifc-lite/data'
import type { EntityData } from '@/lib/ifc-data'

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
