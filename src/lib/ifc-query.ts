import { IfcQuery, type ComparisonOperator, type QueryResultEntity } from '@ifc-lite/query'
import type { IfcDataStore } from '@ifc-lite/parser'

export type TypeScope = 'all' | 'walls' | 'doors' | 'windows' | 'slabs' | 'columns' | 'beams' | 'spaces'

export type PropertyClause = {
  id: string
  pset: string
  name: string
  op: ComparisonOperator
  value: string
}

export type QuerySpec = {
  typeScope: TypeScope
  storeyId: number | null
  clauses: PropertyClause[]
}

export const EMPTY_QUERY: QuerySpec = {
  typeScope: 'all',
  storeyId: null,
  clauses: [],
}

export const TYPE_OPTIONS: Array<{ value: TypeScope; label: string }> = [
  { value: 'all', label: 'All types' },
  { value: 'walls', label: 'Walls' },
  { value: 'doors', label: 'Doors' },
  { value: 'windows', label: 'Windows' },
  { value: 'slabs', label: 'Slabs' },
  { value: 'columns', label: 'Columns' },
  { value: 'beams', label: 'Beams' },
  { value: 'spaces', label: 'Spaces' },
]

export const OPERATORS: Array<{ value: ComparisonOperator; label: string }> = [
  { value: '=', label: '=' },
  { value: '!=', label: '≠' },
  { value: '>', label: '>' },
  { value: '>=', label: '≥' },
  { value: '<', label: '<' },
  { value: '<=', label: '≤' },
  { value: 'contains', label: 'contains' },
  { value: 'startsWith', label: 'starts with' },
]

export type QueryPreset = {
  id: string
  label: string
  spec: QuerySpec
}

export const QUERY_PRESETS: QueryPreset[] = [
  {
    id: 'walls',
    label: 'Walls',
    spec: { typeScope: 'walls', storeyId: null, clauses: [] },
  },
  {
    id: 'external-walls',
    label: 'External walls',
    spec: {
      typeScope: 'walls',
      storeyId: null,
      clauses: [{ id: 'ext', pset: 'Pset_WallCommon', name: 'IsExternal', op: '=', value: 'true' }],
    },
  },
  {
    id: 'load-bearing',
    label: 'Load-bearing walls',
    spec: {
      typeScope: 'walls',
      storeyId: null,
      clauses: [{ id: 'lb', pset: 'Pset_WallCommon', name: 'LoadBearing', op: '=', value: 'true' }],
    },
  },
  {
    id: 'fire-rating',
    label: 'FireRating REI…',
    spec: {
      typeScope: 'walls',
      storeyId: null,
      clauses: [{ id: 'fr', pset: 'Pset_WallCommon', name: 'FireRating', op: 'startsWith', value: 'REI' }],
    },
  },
  {
    id: 'large-area',
    label: 'NetSideArea > 10',
    spec: {
      typeScope: 'walls',
      storeyId: null,
      clauses: [{ id: 'area', pset: 'Qto_WallBaseQuantities', name: 'NetSideArea', op: '>', value: '10' }],
    },
  },
]

export const COMPARISON_OPS: ComparisonOperator[] = OPERATORS.map((item) => item.value)

export function isQueryActive(spec: QuerySpec): boolean {
  return spec.typeScope !== 'all' || spec.storeyId != null || spec.clauses.length > 0
}

export function parseFilterValue(raw: string): string | number | boolean {
  const trimmed = raw.trim()
  if (/^(true|\.t\.)$/i.test(trimmed)) return true
  if (/^(false|\.f\.)$/i.test(trimmed)) return false
  if (trimmed !== '' && Number.isFinite(Number(trimmed))) return Number(trimmed)
  return trimmed
}

export function formatPropertyValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(3)
  if (Array.isArray(value)) return value.map(formatPropertyValue).join(', ')
  return String(value)
}

export function createIfcQuery(store: IfcDataStore): IfcQuery {
  return new IfcQuery(store)
}

export function executeQuery(store: IfcDataStore, spec: QuerySpec): QueryResultEntity[] {
  if (!isQueryActive(spec)) return []

  const query = new IfcQuery(store)
  let scoped =
    spec.typeScope === 'all'
      ? spec.storeyId != null
        ? query.onStorey(spec.storeyId)
        : query.all()
      : startTypeQuery(query, spec.typeScope)

  for (const clause of spec.clauses) {
    if (!clause.pset.trim() || !clause.name.trim()) continue
    scoped = scoped.whereProperty(clause.pset.trim(), clause.name.trim(), clause.op, parseFilterValue(clause.value))
  }

  let rows = scoped.includeProperties().includeQuantities().execute()
  if (spec.storeyId != null && spec.typeScope !== 'all') {
    const onStorey = new Set(query.onStorey(spec.storeyId).execute().map((row) => row.expressId))
    rows = rows.filter((row) => onStorey.has(row.expressId))
  }
  return rows
}

export function queryIds(rows: QueryResultEntity[]): Set<number> {
  return new Set(rows.map((row) => row.expressId))
}

function startTypeQuery(query: IfcQuery, scope: Exclude<TypeScope, 'all'>) {
  switch (scope) {
    case 'walls':
      return query.walls()
    case 'doors':
      return query.doors()
    case 'windows':
      return query.windows()
    case 'slabs':
      return query.slabs()
    case 'columns':
      return query.columns()
    case 'beams':
      return query.beams()
    case 'spaces':
      return query.spaces()
  }
}
