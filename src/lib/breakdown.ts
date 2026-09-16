import type { IfcQuery } from '@ifc-lite/query'
import { formatPropertyValue } from '@/lib/ifc-query'
import {
  ATTRIBUTE_IFC_TYPE,
  ATTRIBUTE_NAME,
  ATTRIBUTE_STOREY,
  type PropertyRef,
} from '@/lib/property-tree'

export type BreakdownMode = 'type' | 'storey' | 'name' | 'external' | 'fire-rating'

export type BreakdownRow = {
  expressId: number
  type: string
  name: string
  storeyId?: number | null
  storeyName?: string | null
  getProperty: (pset: string, name: string) => unknown
}

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
  rows: BreakdownRow[],
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
  row: BreakdownRow,
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
      if (storey) return { key: `s:${storey.expressId}`, label: storey.name || 'Unassigned' }
      if (row.storeyId != null) {
        return { key: `s:${row.storeyId}`, label: row.storeyName || `Storey #${row.storeyId}` }
      }
      return { key: 'unassigned', label: row.storeyName || 'Unassigned' }
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

export function propertyRefFromMode(mode: BreakdownMode): PropertyRef {
  switch (mode) {
    case 'storey':
      return ATTRIBUTE_STOREY
    case 'name':
      return ATTRIBUTE_NAME
    case 'external':
      return { set: 'Pset_WallCommon', name: 'IsExternal', kind: 'property' }
    case 'fire-rating':
      return { set: 'Pset_WallCommon', name: 'FireRating', kind: 'property' }
    default:
      return ATTRIBUTE_IFC_TYPE
  }
}

export function breakdownModeFromRef(ref: PropertyRef): BreakdownMode {
  if (ref.kind === 'attribute' && ref.name === 'Storey') return 'storey'
  if (ref.kind === 'attribute' && ref.name === 'Name') return 'name'
  if (ref.name === 'IsExternal') return 'external'
  if (ref.name === 'FireRating') return 'fire-rating'
  return 'type'
}
