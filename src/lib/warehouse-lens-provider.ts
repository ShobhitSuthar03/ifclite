import { all, type BimDatabase } from '@/lib/bim-sql/database'
import type { LensDataProvider } from '@ifc-lite/lens'

type ElementRow = {
  express_id: number
  ifc_type: string
  name: string | null
  description: string | null
  object_type: string | null
  tag: string | null
  material: string | null
  zone_name: string | null
}

type PropRow = {
  express_id: number
  pset: string
  name: string
  value: string | null
  numeric_value: number | null
}

type QtyRow = {
  express_id: number
  qset: string
  name: string
  value: number | null
}

function loadElementRows(db: BimDatabase): ElementRow[] {
  try {
    return all<ElementRow>(
      db,
      'SELECT express_id, ifc_type, name, description, object_type, tag, material, zone_name FROM elements',
    )
  } catch (caught) {
    console.warn('Warehouse lens query with zone_name failed; retrying without it', caught)
    return all<Omit<ElementRow, 'zone_name'>>(
      db,
      'SELECT express_id, ifc_type, name, description, object_type, tag, material FROM elements',
    ).map((row) => ({ ...row, zone_name: null }))
  }
}

/** LensDataProvider over warehouse.sqlite so the Lens tab works after a skip-parse reopen. */
export function createWarehouseLensProvider(db: BimDatabase): LensDataProvider {
  const elements = loadElementRows(db)
  const byId = new Map(elements.map((row) => [row.express_id, row]))
  let packed = false
  const props = new Map<number, Map<string, Map<string, unknown>>>()
  const qtys = new Map<number, Map<string, Map<string, number>>>()

  const ensurePacked = () => {
    if (packed) return
    packed = true
    for (const row of all<PropRow>(db, 'SELECT express_id, pset, name, value, numeric_value FROM element_properties')) {
      const bySet = props.get(row.express_id) ?? new Map()
      const values = bySet.get(row.pset) ?? new Map()
      values.set(row.name, propertyValue(row.value, row.numeric_value))
      bySet.set(row.pset, values)
      props.set(row.express_id, bySet)
    }
    for (const row of all<QtyRow>(db, 'SELECT express_id, qset, name, value FROM quantities')) {
      const bySet = qtys.get(row.express_id) ?? new Map()
      const values = bySet.get(row.qset) ?? new Map()
      if (row.value != null) values.set(row.name, row.value)
      bySet.set(row.qset, values)
      qtys.set(row.express_id, bySet)
    }
  }

  return {
    getEntityCount() {
      return elements.length
    },
    forEachEntity(callback) {
      for (const row of elements) callback(row.express_id, 'model')
    },
    getEntityType(id) {
      return byId.get(id)?.ifc_type || undefined
    },
    getPropertyValue(id, propertySetName, propertyName) {
      ensurePacked()
      return props.get(id)?.get(propertySetName)?.get(propertyName)
    },
    getPropertySets(id) {
      ensurePacked()
      const bySet = props.get(id)
      if (!bySet) return []
      return [...bySet.entries()].map(([name, values]) => ({
        name,
        properties: [...values.entries()].map(([propName, value]) => ({ name: propName, value })),
      }))
    },
    getEntityAttribute(id, attrName) {
      const row = byId.get(id)
      if (!row) return undefined
      const key = attrName.toLowerCase()
      if (key === 'name') return row.name || undefined
      if (key === 'description') return row.description || undefined
      if (key === 'objecttype') return row.object_type || undefined
      if (key === 'tag') return row.tag || undefined
      return undefined
    },
    getQuantityValue(id, qsetName, quantName) {
      ensurePacked()
      return qtys.get(id)?.get(qsetName)?.get(quantName)
    },
    getQuantitySets(id) {
      ensurePacked()
      const bySet = qtys.get(id)
      if (!bySet) return []
      return [...bySet.entries()].map(([name, values]) => ({
        name,
        quantities: [...values.keys()].map((quantName) => ({ name: quantName })),
      }))
    },
    getMaterialName(id) {
      return byId.get(id)?.material || undefined
    },
    getEntityGroups(id) {
      const zone = byId.get(id)?.zone_name
      if (!zone) return []
      return [{ id, name: zone, type: 'IfcZone' }]
    },
  }
}

function propertyValue(value: string | null, numeric: number | null): unknown {
  if (value != null && value !== '') {
    if (/^(true|\.t\.)$/i.test(value)) return true
    if (/^(false|\.f\.)$/i.test(value)) return false
    return value
  }
  if (numeric == null || !Number.isFinite(numeric)) return undefined
  return numeric
}
