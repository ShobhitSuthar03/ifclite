import {
  extractEntityAttributesOnDemand,
  extractMaterialsOnDemand,
  extractPropertiesOnDemand,
  extractQuantitiesOnDemand,
  type IfcDataStore,
} from '@ifc-lite/parser'
import { discoverDataSources, type LensDataProvider } from '@ifc-lite/lens'
import type { PropertyCatalogSet } from '@/lib/bim-sql'

const SKIP_LENS_TYPES = new Set([
  'IfcProject',
  'IfcSite',
  'IfcBuilding',
  'IfcBuildingStorey',
  'IfcFacility',
  'IfcOwnerHistory',
  'IfcGeometricRepresentationContext',
  'IfcGeometricRepresentationSubContext',
])

function shouldLensEntity(typeName: string | undefined): boolean {
  if (!typeName) return false
  if (SKIP_LENS_TYPES.has(typeName)) return false
  if (typeName.startsWith('IfcRel')) return false
  return true
}

export function createLensProvider(store: IfcDataStore): LensDataProvider {
  return {
    getEntityCount() {
      let count = 0
      const seen = new Set<number>()
      for (const ids of store.entityIndex.byType.values()) {
        for (const id of ids) {
          if (seen.has(id)) continue
          seen.add(id)
          if (shouldLensEntity(store.entities.getTypeName(id))) count += 1
        }
      }
      return count
    },
    forEachEntity(callback) {
      const seen = new Set<number>()
      for (const ids of store.entityIndex.byType.values()) {
        for (const id of ids) {
          if (seen.has(id)) continue
          seen.add(id)
          if (!shouldLensEntity(store.entities.getTypeName(id))) continue
          callback(id, 'model')
        }
      }
    },
    getEntityType(id) {
      return store.entities.getTypeName(id) || undefined
    },
    getPropertyValue(id, propertySetName, propertyName) {
      const pset = extractPropertiesOnDemand(store, id).find((item) => item.name === propertySetName)
      return pset?.properties.find((item) => item.name === propertyName)?.value
    },
    getPropertySets(id) {
      return extractPropertiesOnDemand(store, id).map((pset) => ({
        name: pset.name,
        properties: pset.properties.map((property) => ({ name: property.name, value: property.value })),
      }))
    },
    getEntityAttribute(id, attrName) {
      const attrs = extractEntityAttributesOnDemand(store, id)
      const key = attrName.toLowerCase()
      if (key === 'name') return attrs.name || store.entities.getName(id)
      if (key === 'description') return attrs.description
      if (key === 'objecttype') return attrs.objectType
      if (key === 'tag') return attrs.tag
      if (key === 'globalid') return attrs.globalId
      return undefined
    },
    getQuantityValue(id, qsetName, quantName) {
      const qset = extractQuantitiesOnDemand(store, id).find((item) => item.name === qsetName)
      return qset?.quantities.find((item) => item.name === quantName)?.value
    },
    getQuantitySets(id) {
      return extractQuantitiesOnDemand(store, id).map((qset) => ({
        name: qset.name,
        quantities: qset.quantities.map((quantity) => ({ name: quantity.name })),
      }))
    },
    getMaterialName(id) {
      const material = extractMaterialsOnDemand(store, id)
      return (
        material?.name ||
        material?.layers?.[0]?.materialName ||
        material?.layers?.[0]?.name ||
        material?.materials?.[0]?.name
      )
    },
  }
}

export function propertyCatalogFromLensProvider(provider: LensDataProvider): PropertyCatalogSet[] {
  const discovered = discoverDataSources(provider, { properties: true, quantities: true })
  const rows: PropertyCatalogSet[] = []
  if (discovered.propertySets) {
    for (const [set, names] of discovered.propertySets) {
      rows.push({ set, names: [...names], kind: 'property' })
    }
  }
  if (discovered.quantitySets) {
    for (const [set, names] of discovered.quantitySets) {
      rows.push({ set, names: [...names], kind: 'quantity' })
    }
  }
  return rows.sort((left, right) => left.set.localeCompare(right.set))
}
