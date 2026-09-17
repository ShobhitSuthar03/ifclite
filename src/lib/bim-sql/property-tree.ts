import { all, type BimDatabase } from '@/lib/bim-sql/database'
import { isQueryActive, type QuerySpec } from '@/lib/ifc-query'
import { queryWarehouse } from '@/lib/bim-sql/catalog'
import {
  ATTRIBUTE_SET,
  exactValueLabel,
  nestByValues,
  type PropertyRef,
  type PropertyTreeNode,
} from '@/lib/property-tree'

type AttributeRow = {
  express_id: number
  ifc_type: string
  name: string | null
  storey_name: string | null
  material: string | null
  object_type: string | null
  tag: string | null
}

type PropRow = {
  express_id: number
  value: string | null
  numeric_value: number | null
}

type QtyRow = {
  express_id: number
  value: number | null
}

export function warehouseScopeIds(db: BimDatabase, spec: QuerySpec | null): number[] {
  if (spec && isQueryActive(spec)) {
    return queryWarehouse(db, spec).map((row) => row.expressId)
  }
  return all<{ express_id: number }>(db, 'SELECT express_id FROM elements').map((row) => row.express_id)
}

export function loadValueLabels(db: BimDatabase, ref: PropertyRef, ids: number[]): Map<number, string> {
  const scope = new Set(ids)
  const labels = new Map<number, string>()
  for (const id of ids) labels.set(id, exactValueLabel(null, null))

  if (ref.kind === 'attribute') {
    for (const row of all<AttributeRow>(
      db,
      'SELECT express_id, ifc_type, name, storey_name, material, object_type, tag FROM elements',
    )) {
      if (!scope.has(row.express_id)) continue
      labels.set(row.express_id, attributeLabel(ref.name, row))
    }
    return labels
  }

  if (ref.kind === 'quantity') {
    for (const row of all<QtyRow>(db, 'SELECT express_id, value FROM quantities WHERE qset = ? AND name = ?', [
      ref.set,
      ref.name,
    ])) {
      if (!scope.has(row.express_id)) continue
      labels.set(row.express_id, exactValueLabel(row.value == null ? null : String(row.value), row.value))
    }
    return labels
  }

  for (const row of all<PropRow>(
    db,
    'SELECT express_id, value, numeric_value FROM element_properties WHERE pset = ? AND name = ?',
    [ref.set, ref.name],
  )) {
    if (!scope.has(row.express_id)) continue
    labels.set(row.express_id, exactValueLabel(row.value, row.numeric_value))
  }
  return labels
}

export function sumNumericValues(db: BimDatabase, ref: PropertyRef, ids: number[]): number {
  if (ids.length === 0) return 0
  const scope = new Set(ids)
  let sum = 0
  try {
    if (ref.kind === 'quantity') {
      for (const row of all<QtyRow>(db, 'SELECT express_id, value FROM quantities WHERE qset = ? AND name = ?', [
        ref.set,
        ref.name,
      ])) {
        if (!scope.has(row.express_id) || row.value == null || !Number.isFinite(row.value)) continue
        sum += row.value
      }
      return sum
    }
    if (ref.kind === 'property') {
      for (const row of all<PropRow>(
        db,
        'SELECT express_id, value, numeric_value FROM element_properties WHERE pset = ? AND name = ?',
        [ref.set, ref.name],
      )) {
        if (!scope.has(row.express_id)) continue
        const n = numericFromStored(row.value, row.numeric_value)
        if (n != null) sum += n
      }
    }
  } catch (caught) {
    console.warn('Warehouse numeric sum failed', caught)
  }
  return sum
}

function numericFromStored(value: string | null, numeric: number | null): number | null {
  if (numeric != null && Number.isFinite(numeric)) return numeric
  if (!value) return null
  const match = value.trim().replace(',', '.').match(/-?\d+(?:\.\d+)?/)
  if (!match) return null
  const n = Number(match[0])
  return Number.isFinite(n) ? n : null
}

export function buildWarehousePropertyTree(
  db: BimDatabase,
  rules: PropertyRef[],
  spec: QuerySpec | null,
  ids?: number[],
): PropertyTreeNode[] {
  const filtered = rules.filter((rule) => rule.name.trim())
  if (filtered.length === 0) return []
  try {
    const scope = ids ?? warehouseScopeIds(db, spec)
    const layers = filtered.map((rule) => loadValueLabels(db, rule, scope))
    return nestByValues(scope, layers)
  } catch (caught) {
    console.warn('Warehouse property tree failed', caught)
    return []
  }
}

function attributeLabel(name: string, row: AttributeRow): string {
  if (name === 'IFC Type') return exactValueLabel(row.ifc_type, null)
  if (name === 'Storey') return exactValueLabel(row.storey_name, null)
  if (name === 'Name') return exactValueLabel(row.name, null)
  if (name === 'Material') return exactValueLabel(row.material, null)
  if (name === 'ObjectType') return exactValueLabel(row.object_type, null)
  if (name === 'Tag') return exactValueLabel(row.tag, null)
  return exactValueLabel(null, null)
}

export { ATTRIBUTE_SET }
