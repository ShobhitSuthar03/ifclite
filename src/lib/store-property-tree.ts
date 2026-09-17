import {
  extractEntityAttributesOnDemand,
  extractMaterialsOnDemand,
  extractPropertiesOnDemand,
  extractQuantitiesOnDemand,
  type IfcDataStore,
} from '@ifc-lite/parser'
import { createIfcQuery } from '@/lib/ifc-query'
import { overlayLabel, type PropertyOverlay } from '@/lib/mutation-overlay'
import { exactValueLabel, nestByValues, type PropertyRef, type PropertyTreeNode } from '@/lib/property-tree'

export const STORE_PROPERTY_CHUNK = 64

export function labelStorePropertyChunk(
  store: IfcDataStore,
  ref: PropertyRef,
  ids: number[],
  from: number,
  to: number,
  labels: Map<number, string>,
  overlay?: PropertyOverlay,
) {
  const query = ref.kind === 'attribute' && ref.name === 'Storey' ? createIfcQuery(store) : null
  const end = Math.min(to, ids.length)
  for (let i = from; i < end; i += 1) {
    const id = ids[i]
    const edited = overlayLabel(overlay, ref, id)
    labels.set(id, edited !== undefined ? exactValueLabel(edited, null) : storeValueLabel(store, ref, id, query))
  }
}

export function treeFromLabeledIds(ids: number[], labels: Map<number, string>): PropertyTreeNode[] {
  return nestByValues(ids, [labels])
}

function storeValueLabel(
  store: IfcDataStore,
  ref: PropertyRef,
  id: number,
  query: ReturnType<typeof createIfcQuery> | null,
): string {
  if (ref.kind === 'attribute') {
    if (ref.name === 'IFC Type') return exactValueLabel(store.entities.getTypeName(id), null)
    if (ref.name === 'Name') return exactValueLabel(store.entities.getName(id), null)
    if (ref.name === 'Storey') {
      try {
        const storey = query?.entity(id).storey()
        return exactValueLabel(storey?.name, null)
      } catch {
        return exactValueLabel(null, null)
      }
    }
    if (ref.name === 'Material') {
      const material = extractMaterialsOnDemand(store, id)
      return exactValueLabel(
        material?.name || material?.layers?.[0]?.materialName || material?.materials?.[0]?.name,
        null,
      )
    }
    if (ref.name === 'ObjectType' || ref.name === 'Tag') {
      try {
        const attrs = extractEntityAttributesOnDemand(store, id)
        return exactValueLabel(ref.name === 'Tag' ? attrs.tag : attrs.objectType, null)
      } catch {
        return exactValueLabel(null, null)
      }
    }
  }
  if (ref.kind === 'quantity') {
    const qset = extractQuantitiesOnDemand(store, id).find((item) => item.name === ref.set)
    const qty = qset?.quantities.find((item) => item.name === ref.name)
    const value = qty?.value
    return exactValueLabel(value == null ? null : String(value), typeof value === 'number' ? value : null)
  }
  const pset = extractPropertiesOnDemand(store, id).find((item) => item.name === ref.set)
  const prop = pset?.properties.find((item) => item.name === ref.name)
  const value = prop?.value
  if (typeof value === 'boolean') return exactValueLabel(value ? 'true' : 'false', null)
  if (typeof value === 'number') return exactValueLabel(String(value), value)
  return exactValueLabel(value == null ? null : String(value), null)
}
