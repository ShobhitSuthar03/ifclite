import type { IfcQuery, QueryResultEntity } from '@ifc-lite/query'
import { formatPropertyValue } from '@/lib/ifc-query'

export type BreakdownMode = 'type' | 'storey' | 'name' | 'external' | 'fire-rating'

export type BreakdownGroup = {
  key: string
  label: string
  count: number
  ids: number[]
}

export const BREAKDOWN_OPTIONS: Array<{ value: BreakdownMode; label: string }> = [
  { value: 'type', label: 'IFC type' },
  { value: 'storey', label: 'Storey' },
  { value: 'name', label: 'Name' },
  { value: 'external', label: 'IsExternal' },
  { value: 'fire-rating', label: 'FireRating' },
]

export function buildBreakdown(
  rows: QueryResultEntity[],
  mode: BreakdownMode,
  query: IfcQuery | null,
): BreakdownGroup[] {
  const buckets = new Map<string, { label: string; ids: number[] }>()

  for (const row of rows) {
    const { key, label } = groupFor(row, mode, query)
    const bucket = buckets.get(key) ?? { label, ids: [] }
    bucket.ids.push(row.expressId)
    buckets.set(key, bucket)
  }

  return [...buckets.entries()]
    .map(([key, bucket]) => ({
      key,
      label: bucket.label,
      count: bucket.ids.length,
      ids: bucket.ids,
    }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
}

function groupFor(
  row: QueryResultEntity,
  mode: BreakdownMode,
  query: IfcQuery | null,
): { key: string; label: string } {
  switch (mode) {
    case 'type':
      return { key: row.type || 'Unknown', label: row.type || 'Unknown' }
    case 'name': {
      const name = row.name || `#${row.expressId}`
      return { key: name, label: name }
    }
    case 'storey': {
      const storey = query?.entity(row.expressId).storey()
      const label = storey?.name || 'Unassigned'
      return { key: storey ? `s:${storey.expressId}` : 'unassigned', label }
    }
    case 'external': {
      const value = row.getProperty('Pset_WallCommon', 'IsExternal')
      const label = formatPropertyValue(value)
      return { key: `ext:${label}`, label }
    }
    case 'fire-rating': {
      const value = row.getProperty('Pset_WallCommon', 'FireRating')
      const label = formatPropertyValue(value)
      return { key: `fr:${label}`, label }
    }
  }
}
