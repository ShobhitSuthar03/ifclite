import { IfcTypeEnum, IfcTypeEnumFromString } from '@ifc-lite/data'
import type { EntityData, SpatialTreeNode } from '@/lib/ifc-data'
import { all, type BimDatabase } from '@/lib/bim-sql/database'

type SpatialRow = {
  express_id: number
  name: string
  type: string
  elevation: number | null
  parent_express_id: number | null
}

type ElementRow = {
  express_id: number
  ifc_type: string
  name: string | null
  storey_id: number | null
}

export type WarehouseLookup = {
  name: string
  ifcType: string
}

function spatialType(name: string): IfcTypeEnum {
  try {
    return IfcTypeEnumFromString(name)
  } catch {
    return IfcTypeEnum.IfcSpatialZone
  }
}

export function elementLookupFromWarehouse(db: BimDatabase): Map<number, WarehouseLookup> {
  const rows = all<ElementRow>(db, 'SELECT express_id, ifc_type, name, storey_id FROM elements')
  const lookup = new Map<number, WarehouseLookup>()
  for (const row of rows) {
    lookup.set(row.express_id, {
      name: row.name ?? '',
      ifcType: row.ifc_type || 'IfcProduct',
    })
  }
  return lookup
}

export function spatialTreeFromWarehouse(db: BimDatabase): SpatialTreeNode | null {
  const locations = all<SpatialRow>(
    db,
    'SELECT express_id, name, type, elevation, parent_express_id FROM spatial_locations',
  )
  if (locations.length === 0) return null

  const elements = all<ElementRow>(db, 'SELECT express_id, ifc_type, name, storey_id FROM elements')
  const elementsByHost = new Map<number, ElementRow[]>()
  for (const element of elements) {
    const host = element.storey_id
    if (host == null) continue
    const list = elementsByHost.get(host) ?? []
    list.push(element)
    elementsByHost.set(host, list)
  }

  const childrenOf = new Map<number | null, SpatialRow[]>()
  for (const row of locations) {
    const parent = row.parent_express_id
    const list = childrenOf.get(parent) ?? []
    list.push(row)
    childrenOf.set(parent, list)
  }

  const build = (row: SpatialRow): SpatialTreeNode => {
    const children = (childrenOf.get(row.express_id) ?? []).map(build)
    const hosted = elementsByHost.get(row.express_id) ?? []
    const typeMap = new Map<string, number[]>()
    for (const element of hosted) {
      const typeName = element.ifc_type || 'IfcProduct'
      const ids = typeMap.get(typeName) ?? []
      ids.push(element.express_id)
      typeMap.set(typeName, ids)
    }
    const elementGroups = [...typeMap.entries()]
      .sort((left, right) => right[1].length - left[1].length)
      .map(([typeName, ids]) => ({ typeName, ids }))
    return {
      expressId: row.express_id,
      name: row.name || `#${row.express_id}`,
      type: spatialType(row.type),
      elevation: row.elevation ?? undefined,
      children,
      elementGroups,
      totalElements: hosted.length + children.reduce((sum, child) => sum + child.totalElements, 0),
    }
  }

  const roots = childrenOf.get(null) ?? []
  if (roots.length === 0) return build(locations[0])
  if (roots.length === 1) return build(roots[0])
  return {
    expressId: roots[0].express_id,
    name: 'Model',
    type: IfcTypeEnum.IfcProject,
    children: roots.map(build),
    elementGroups: [],
    totalElements: 0,
  }
}

export function entityDataFromWarehouse(db: BimDatabase, expressId: number, ifcType: string): EntityData {
  const row = all<{
    global_id: string | null
    ifc_type: string
    name: string | null
    description: string | null
    object_type: string | null
    tag: string | null
  }>(
    db,
    `SELECT global_id, ifc_type, name, description, object_type, tag
     FROM elements WHERE express_id = ? LIMIT 1`,
    [expressId],
  )[0]

  const props = all<{ pset: string; name: string; value: string | null }>(
    db,
    'SELECT pset, name, value FROM element_properties WHERE express_id = ? ORDER BY pset, name',
    [expressId],
  )
  const qtys = all<{ qset: string; name: string; value: number | null; unit: string | null }>(
    db,
    'SELECT qset, name, value, unit FROM quantities WHERE express_id = ? ORDER BY qset, name',
    [expressId],
  )

  const propertySets: EntityData['propertySets'] = []
  for (const prop of props) {
    let set = propertySets.find((item) => item.name === prop.pset)
    if (!set) {
      set = { name: prop.pset, properties: [] }
      propertySets.push(set)
    }
    set.properties.push({ name: prop.name, value: prop.value || '—' })
  }

  const quantitySets: EntityData['quantitySets'] = []
  for (const qty of qtys) {
    let set = quantitySets.find((item) => item.name === qty.qset)
    if (!set) {
      set = { name: qty.qset, quantities: [] }
      quantitySets.push(set)
    }
    const value = typeof qty.value === 'number' ? qty.value.toFixed(3) : '—'
    set.quantities.push({
      name: qty.name,
      value: qty.unit ? `${value} ${qty.unit}` : value,
    })
  }

  return {
    expressId,
    ifcType: row?.ifc_type || ifcType,
    globalId: row?.global_id ?? '',
    name: row?.name ?? '',
    description: row?.description ?? '',
    objectType: row?.object_type ?? '',
    tag: row?.tag ?? '',
    propertySets,
    quantitySets,
  }
}
