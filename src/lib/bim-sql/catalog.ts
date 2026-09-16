import { compareFilterValue } from '@ifc-lite/query'
import { all, type BimDatabase } from '@/lib/bim-sql/database'
import {
  parseFilterValue,
  type PropertyClause,
  type QuerySpec,
  type TypeScope,
} from '@/lib/ifc-query'
import { ATTRIBUTE_REFS, ATTRIBUTE_SET } from '@/lib/property-tree'

export type PropertyCatalogSet = {
  set: string
  names: string[]
  kind: 'property' | 'quantity' | 'attribute'
}

const TYPE_LIKE: Record<Exclude<TypeScope, 'all'>, string> = {
  walls: 'IfcWall%',
  doors: 'IfcDoor%',
  windows: 'IfcWindow%',
  slabs: 'IfcSlab%',
  columns: 'IfcColumn%',
  beams: 'IfcBeam%',
  spaces: 'IfcSpace%',
}

type ElementRow = {
  express_id: number
  ifc_type: string
  name: string | null
  storey_id: number | null
  storey_name: string | null
}

type ValueRow = {
  express_id: number
  set_name: string
  name: string
  value: string | null
  numeric_value: number | null
}

export function propertyCatalogFromWarehouse(db: BimDatabase): PropertyCatalogSet[] {
  const map = new Map<string, { names: string[]; kind: PropertyCatalogSet['kind'] }>()
  const add = (set: string, name: string, kind: PropertyCatalogSet['kind']) => {
    const entry = map.get(set) ?? { names: [], kind }
    if (!entry.names.includes(name)) entry.names.push(name)
    map.set(set, entry)
  }
  try {
    for (const row of all<{ pset: string; name: string }>(
      db,
      'SELECT DISTINCT pset, name FROM element_properties ORDER BY pset, name',
    )) {
      add(row.pset, row.name, 'property')
    }
    for (const row of all<{ qset: string; name: string }>(
      db,
      'SELECT DISTINCT qset, name FROM quantities ORDER BY qset, name',
    )) {
      add(row.qset, row.name, 'quantity')
    }
  } catch (caught) {
    console.warn('Warehouse property catalog failed', caught)
  }
  return [...map.entries()].map(([set, entry]) => ({ set, names: entry.names, kind: entry.kind }))
}

export function groupingCatalog(catalog: PropertyCatalogSet[], search = ''): PropertyCatalogSet[] {
  const needle = search.trim().toLowerCase()
  const rows: PropertyCatalogSet[] = [
    { set: ATTRIBUTE_SET, names: ATTRIBUTE_REFS.map((item) => item.name), kind: 'attribute' },
    ...catalog,
  ]
  if (!needle) return rows
  return rows
    .map((group) => ({
      ...group,
      names: group.names.filter(
        (name) => name.toLowerCase().includes(needle) || group.set.toLowerCase().includes(needle),
      ),
    }))
    .filter((group) => group.names.length > 0)
}

export type WarehouseQueryRow = {
  expressId: number
  type: string
  name: string
  storeyId: number | null
  storeyName: string | null
  getProperty: (pset: string, name: string) => unknown
}

export function queryWarehouse(db: BimDatabase, spec: QuerySpec): WarehouseQueryRow[] {
  const where: string[] = ['1=1']
  const params: Array<string | number> = []
  if (spec.typeScope !== 'all') {
    where.push('e.ifc_type LIKE ?')
    params.push(TYPE_LIKE[spec.typeScope])
  }
  if (spec.storeyId != null) {
    where.push('e.storey_id = ?')
    params.push(spec.storeyId)
  }
  const candidates = all<ElementRow>(
    db,
    `SELECT express_id, ifc_type, name, storey_id, storey_name FROM elements e WHERE ${where.join(' AND ')}`,
    params,
  )
  const clauses = spec.clauses.filter((clause) => clause.pset.trim() && clause.name.trim())
  let matchedRows = candidates
  if (clauses.length > 0) {
    const ids = new Set(candidates.map((row) => row.express_id))
    for (const clause of clauses) {
      const matched = matchingIdsForClause(db, clause, ids)
      for (const id of [...ids]) {
        if (!matched.has(id)) ids.delete(id)
      }
    }
    matchedRows = candidates.filter((row) => ids.has(row.express_id))
  }

  const props = new Map<string, unknown>()
  for (const row of all<ValueRow>(
    db,
    `SELECT express_id, pset AS set_name, name, value, numeric_value
     FROM element_properties WHERE name IN ('IsExternal', 'FireRating')`,
  )) {
    props.set(
      `${row.express_id}\0${row.set_name}\0${row.name}`,
      row.value != null && row.value !== '' ? row.value : row.numeric_value,
    )
  }

  return matchedRows.map((row) => ({
    expressId: row.express_id,
    type: row.ifc_type,
    name: row.name ?? '',
    storeyId: row.storey_id,
    storeyName: row.storey_name,
    getProperty: (pset: string, name: string) => props.get(`${row.express_id}\0${pset}\0${name}`),
  }))
}

function matchingIdsForClause(db: BimDatabase, clause: PropertyClause, scope: Set<number>): Set<number> {
  const pset = clause.pset.trim()
  const name = clause.name.trim()
  const expected = parseFilterValue(clause.value)
  const matched = new Set<number>()
  const props = all<ValueRow>(
    db,
    `SELECT express_id, pset AS set_name, name, value, numeric_value
     FROM element_properties WHERE pset = ? AND name = ?`,
    [pset, name],
  )
  const qtys = all<ValueRow>(
    db,
    `SELECT express_id, qset AS set_name, name, CAST(value AS TEXT) AS value, value AS numeric_value
     FROM quantities WHERE qset = ? AND name = ?`,
    [pset, name],
  )
  for (const row of props.concat(qtys)) {
    if (!scope.has(row.express_id)) continue
    if (valueMatches(row, clause.op, expected)) matched.add(row.express_id)
  }
  return matched
}

function valueMatches(row: ValueRow, op: PropertyClause['op'], expected: string | number | boolean): boolean {
  const actual = warehouseActual(row, expected)
  if (op === 'startsWith') {
    return String(actual ?? '')
      .toLowerCase()
      .startsWith(String(expected).toLowerCase())
  }
  return compareFilterValue(actual, op, expected)
}

function warehouseActual(row: ValueRow, expected: string | number | boolean): unknown {
  const text = row.value
  if (typeof expected === 'boolean') {
    if (text != null && text !== '') return text
    if (row.numeric_value === 1) return true
    if (row.numeric_value === 0) return false
  }
  if (typeof expected === 'number' && row.numeric_value != null && Number.isFinite(row.numeric_value)) {
    return row.numeric_value
  }
  if (text != null && text !== '') return text
  return row.numeric_value
}
