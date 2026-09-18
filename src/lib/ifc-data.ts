import {
  IfcParser,
  extractEntityAttributesOnDemand,
  extractPropertiesOnDemand,
  extractQuantitiesOnDemand,
  type IfcDataStore,
} from '@ifc-lite/parser'
import { WorkerParser } from '@ifc-lite/parser/browser'
import { IfcTypeEnum, type SpatialNode } from '@ifc-lite/data'

export type { IfcDataStore }
export { IfcTypeEnum }

export type PropertySet = {
  name: string
  properties: Array<{ name: string; value: string }>
}

export type QuantitySet = {
  name: string
  quantities: Array<{ name: string; value: string }>
}

export type EntityData = {
  expressId: number
  ifcType: string
  globalId: string
  name: string
  description: string
  objectType: string
  tag: string
  propertySets: PropertySet[]
  quantitySets: QuantitySet[]
}

export type SpatialTreeNode = {
  expressId: number
  name: string
  longName?: string
  type: IfcTypeEnum
  elevation?: number
  children: SpatialTreeNode[]
  elementGroups: Array<{ typeName: string; ids: number[] }>
  totalElements: number
}

/**
 * The full IFC property/spatial parse is CPU-heavy (seconds on a large file) and
 * runs concurrently with Rust's own tessellation pass, so keeping it on the main
 * thread would freeze the UI for that whole window. Offload it to WorkerParser
 * when the runtime supports it (Worker + SharedArrayBuffer + cross-origin
 * isolation - see the COOP/COEP headers in vite.config.ts and tauri.conf.json),
 * falling back to the in-process parser otherwise.
 */
export async function buildDataStore(
  buffer: ArrayBuffer,
  onSpatialReady?: (store: IfcDataStore) => void,
): Promise<IfcDataStore> {
  if (WorkerParser.isSupported()) {
    try {
      const shared = new SharedArrayBuffer(buffer.byteLength)
      new Uint8Array(shared).set(new Uint8Array(buffer))
      return await new WorkerParser().parseColumnar(shared, { onSpatialReady })
    } catch (caught) {
      console.warn('WorkerParser failed; falling back to main-thread IFC parse', caught)
    }
  }
  return new IfcParser().parseColumnar(buffer, { onSpatialReady })
}

export function getEntityData(store: IfcDataStore, expressId: number, ifcType: string): EntityData {
  const attrs = extractEntityAttributesOnDemand(store, expressId)
  const propertySets = extractPropertiesOnDemand(store, expressId).map((pset) => ({
    name: pset.name,
    properties: pset.properties.map((property) => ({
      name: property.name,
      value: formatValue(property.value),
    })),
  }))
  const quantitySets = extractQuantitiesOnDemand(store, expressId).map((qset) => ({
    name: qset.name,
    quantities: qset.quantities.map((quantity) => ({
      name: quantity.name,
      value: typeof quantity.value === 'number' ? quantity.value.toFixed(3) : String(quantity.value),
    })),
  }))

  return {
    expressId,
    ifcType,
    globalId: attrs.globalId,
    name: attrs.name || store.entities.getName(expressId),
    description: attrs.description,
    objectType: attrs.objectType,
    tag: attrs.tag,
    propertySets,
    quantitySets,
  }
}

export function buildSpatialTreeFromStore(store: IfcDataStore): SpatialTreeNode | null {
  const project = store.spatialHierarchy?.project
  if (!project) return null
  return convertNode(project, store)
}

export function spatialNodeMeta(type: IfcTypeEnum): { abbr: string; tone: string } {
  switch (type) {
    case IfcTypeEnum.IfcProject:
      return { abbr: 'P', tone: 'bg-primary text-white' }
    case IfcTypeEnum.IfcSite:
      return { abbr: 'S', tone: 'bg-primary/80 text-white' }
    case IfcTypeEnum.IfcBuilding:
    case IfcTypeEnum.IfcFacility:
    case IfcTypeEnum.IfcBridge:
    case IfcTypeEnum.IfcRoad:
    case IfcTypeEnum.IfcRailway:
      return { abbr: 'B', tone: 'bg-primary/70 text-white' }
    case IfcTypeEnum.IfcBuildingStorey:
    case IfcTypeEnum.IfcFacilityPart:
      return { abbr: 'L', tone: 'bg-primary/60 text-white' }
    case IfcTypeEnum.IfcSpace:
    case IfcTypeEnum.IfcSpatialZone:
      return { abbr: 'R', tone: 'bg-secondary text-muted-foreground' }
    default:
      return { abbr: 'N', tone: 'bg-secondary text-muted-foreground' }
  }
}

function convertNode(node: SpatialNode, store: IfcDataStore): SpatialTreeNode {
  const children = node.children.map((child) => convertNode(child, store))
  const typeMap = new Map<string, number[]>()
  for (const id of node.elements) {
    const typeName = store.entities.getTypeName(id) || 'IfcProduct'
    const list = typeMap.get(typeName) ?? []
    list.push(id)
    typeMap.set(typeName, list)
  }
  const elementGroups = [...typeMap.entries()]
    .sort((left, right) => right[1].length - left[1].length)
    .map(([typeName, ids]) => ({ typeName, ids }))

  return {
    expressId: node.expressId,
    name: node.name || store.entities.getName(node.expressId) || `#${node.expressId}`,
    longName: node.longName,
    type: node.type,
    elevation: node.elevation,
    children,
    elementGroups,
    totalElements: node.elements.length + children.reduce((sum, child) => sum + child.totalElements, 0),
  }
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(4)
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    if ('value' in record) return formatValue(record.value)
    if ('wrappedValue' in record) return formatValue(record.wrappedValue)
    return JSON.stringify(value)
  }
  return String(value)
}
