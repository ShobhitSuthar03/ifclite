export type ViewerAction =
  | { kind: 'select'; ids: number[]; additive: boolean }
  | { kind: 'isolate'; ids: number[]; mode: 'isolate' | 'ghost' }
  | { kind: 'show_all' }
  | { kind: 'fit' }

export type PropertySearchInput = {
  ifcType?: string
  nameContains?: string
  storeyContains?: string
  set?: string
  propertyName?: string
  op?: string
  value?: string
  limit: number
  select: boolean
  isolate: boolean
}

export type PropertySearchHit = {
  id: number
  ifcType: string
  name: string
  storey: string | null
}

export type PropertySearchResult = {
  ids: number[]
  hits: PropertySearchHit[]
  truncated: boolean
}

export type TypeScopeName = 'all' | 'walls' | 'doors' | 'windows' | 'slabs' | 'columns' | 'beams' | 'spaces'

const SEARCH_OPS = ['=', '!=', '>', '>=', '<', '<=', 'contains', 'startsWith'] as const

export function asIds(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is number => typeof item === 'number' && Number.isFinite(item))
}

export function asBool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

export function typeScopeFromIfc(ifcType?: string | null): TypeScopeName {
  if (!ifcType) return 'all'
  const needle = ifcType.toLowerCase()
  if (needle.includes('wall')) return 'walls'
  if (needle.includes('door')) return 'doors'
  if (needle.includes('window')) return 'windows'
  if (needle.includes('slab') || needle.includes('floor')) return 'slabs'
  if (needle.includes('column')) return 'columns'
  if (needle.includes('beam')) return 'beams'
  if (needle.includes('space')) return 'spaces'
  return 'all'
}

export function parsePropertySearch(input: Record<string, unknown>): PropertySearchInput | { error: string } {
  const ifcType = typeof input.ifc_type === 'string' && input.ifc_type.trim() ? input.ifc_type.trim() : undefined
  const nameContains =
    typeof input.name_contains === 'string' && input.name_contains.trim() ? input.name_contains.trim() : undefined
  const storeyContains =
    (typeof input.storey === 'string' && input.storey.trim() ? input.storey.trim() : undefined) ??
    (typeof input.storey_contains === 'string' && input.storey_contains.trim() ? input.storey_contains.trim() : undefined)
  const set = typeof input.set === 'string' && input.set.trim() ? input.set.trim() : undefined
  const propertyName = typeof input.name === 'string' && input.name.trim() ? input.name.trim() : undefined
  const opRaw = typeof input.op === 'string' ? input.op.trim() : ''
  const op = SEARCH_OPS.includes(opRaw as (typeof SEARCH_OPS)[number]) ? opRaw : undefined
  const value = typeof input.value === 'string' ? input.value : undefined
  const limit =
    typeof input.limit === 'number' && input.limit > 0 ? Math.min(200, Math.floor(input.limit)) : 80
  const isolate = asBool(input.isolate, false)
  const select = isolate ? true : asBool(input.select, true)
  if (!ifcType && !nameContains && !storeyContains && !(set && propertyName)) {
    return { error: 'Pass ifc_type, name_contains, storey, or a property clause (set + name).' }
  }
  return {
    ifcType,
    nameContains,
    storeyContains,
    set,
    propertyName,
    op: op ?? (value != null && value !== '' ? 'contains' : undefined),
    value,
    limit,
    select,
    isolate,
  }
}
