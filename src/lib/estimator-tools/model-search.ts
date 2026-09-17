import { queryWarehouse, type BimDatabase } from '@/lib/bim-sql'
import type { IfcDataStore } from '@/lib/ifc-data'
import {
  COMPARISON_OPS,
  EMPTY_QUERY,
  executeQuery,
  isQueryActive,
  type ComparisonOperator,
  type QuerySpec,
  type TypeScope,
} from '@/lib/ifc-query'
import { typeScopeFromIfc, type PropertySearchInput, type PropertySearchResult } from '@/lib/estimator-tools/viewer'

function asOp(raw?: string): ComparisonOperator {
  return (COMPARISON_OPS as string[]).includes(raw ?? '') ? (raw as ComparisonOperator) : 'contains'
}

function matchesType(ifcType: string, needle?: string) {
  if (!needle) return true
  return ifcType.toLowerCase().includes(needle.toLowerCase())
}

function matchesText(value: string | null | undefined, needle?: string) {
  if (!needle) return true
  return (value ?? '').toLowerCase().includes(needle.toLowerCase())
}

function finish(
  hits: Array<{ id: number; ifcType: string; name: string; storey: string | null }>,
  limit: number,
): PropertySearchResult {
  const unique = new Map<number, (typeof hits)[number]>()
  for (const hit of hits) {
    if (!unique.has(hit.id)) unique.set(hit.id, hit)
  }
  const rows = [...unique.values()]
  const truncated = rows.length > limit
  const sliced = rows.slice(0, limit)
  return { ids: sliced.map((row) => row.id), hits: sliced, truncated }
}

export function searchModelElements(args: {
  warehouse: BimDatabase | null
  store: IfcDataStore | null
  meshes?: Array<{ expressId: number; ifcType?: string }>
  input: PropertySearchInput
}): PropertySearchResult {
  const { warehouse, store, meshes, input } = args
  const typeScope = typeScopeFromIfc(input.ifcType) as TypeScope
  const clauses =
    input.set && input.propertyName
      ? [
          {
            id: 'estimator',
            pset: input.set,
            name: input.propertyName,
            op: asOp(input.op),
            value: input.value ?? '',
          },
        ]
      : []
  const spec: QuerySpec = {
    typeScope,
    storeyId: null,
    clauses,
  }

  if (warehouse) {
    const rows = isQueryActive(spec) ? queryWarehouse(warehouse, spec) : queryWarehouse(warehouse, EMPTY_QUERY)
    const hits = rows
      .filter((row) => matchesType(row.type, input.ifcType))
      .filter((row) => matchesText(row.name, input.nameContains))
      .filter((row) => matchesText(row.storeyName, input.storeyContains))
      .map((row) => ({
        id: row.expressId,
        ifcType: row.type,
        name: row.name,
        storey: row.storeyName,
      }))
    return finish(hits, input.limit)
  }

  if (store && isQueryActive(spec)) {
    const rows = executeQuery(store, spec)
    const hits = rows
      .filter((row) => matchesType(row.type, input.ifcType))
      .filter((row) => matchesText(row.name, input.nameContains))
      .map((row) => ({
        id: row.expressId,
        ifcType: row.type || store.entities.getTypeName(row.expressId) || 'IfcProduct',
        name: row.name ?? '',
        storey: null,
      }))
    return finish(hits, input.limit)
  }

  const fromMeshes = (meshes ?? []).filter((mesh) =>
    matchesType(mesh.ifcType ?? store?.entities.getTypeName(mesh.expressId) ?? '', input.ifcType),
  )
  const hits = fromMeshes.map((mesh) => {
    const ifcType = mesh.ifcType ?? store?.entities.getTypeName(mesh.expressId) ?? 'IfcProduct'
    const name = store?.entities.getName(mesh.expressId) ?? ''
    return { id: mesh.expressId, ifcType, name, storey: null }
  }).filter((row) => matchesText(row.name, input.nameContains))
  return finish(hits, input.limit)
}
