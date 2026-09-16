export type SavedView = {
  id: string
  name: string
  ids: number[]
  createdAt: string
}

export function uniquePositiveIds(ids: Iterable<number>): number[] {
  const unique = [...new Set([...ids].filter((id) => Number.isInteger(id) && id > 0))]
  unique.sort((a, b) => a - b)
  return unique
}

export function newViewId(): string {
  return `view-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function createSavedView(name: string, ids: Iterable<number>, now = new Date()): SavedView | null {
  const unique = uniquePositiveIds(ids)
  if (unique.length === 0) return null
  const trimmed = name.trim()
  if (!trimmed) return null
  return {
    id: newViewId(),
    name: trimmed,
    ids: unique,
    createdAt: now.toISOString(),
  }
}

export function replaceSavedViewIds(view: SavedView, ids: Iterable<number>): SavedView | null {
  const unique = uniquePositiveIds(ids)
  if (unique.length === 0) return null
  return { ...view, ids: unique }
}

export function defaultViewName(existing: SavedView[]): string {
  return `View ${existing.length + 1}`
}

export function viewFileStem(name: string): string {
  const stem = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return stem || 'view'
}

export function parseSavedViews(value: unknown): SavedView[] {
  if (!Array.isArray(value)) return []
  const views: SavedView[] = []
  const seen = new Set<string>()
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const row = item as { id?: unknown; name?: unknown; ids?: unknown; createdAt?: unknown }
    const id = typeof row.id === 'string' ? row.id : ''
    const name = typeof row.name === 'string' ? row.name.trim() : ''
    if (!id || !name || seen.has(id)) continue
    const ids = Array.isArray(row.ids) ? uniquePositiveIds(row.ids.filter((entry) => typeof entry === 'number')) : []
    if (ids.length === 0) continue
    seen.add(id)
    views.push({
      id,
      name,
      ids,
      createdAt: typeof row.createdAt === 'string' ? row.createdAt : '',
    })
  }
  return views
}
