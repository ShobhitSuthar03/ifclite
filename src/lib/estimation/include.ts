import type { BuildUpRow } from '@/lib/cost-assembly/build-up'
import { qtyBindingKey } from '@/lib/estimation/qty-bind'

export function parseExcludedLines(value: unknown): Record<string, boolean> {
  const out: Record<string, boolean> = {}
  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === 'string' && item) out[item] = true
    }
    return out
  }
  if (!value || typeof value !== 'object') return {}
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (!key) continue
    if (item === true || item === 1 || item === 'true') out[key] = true
  }
  return out
}

export function leafDescendantIds(rows: BuildUpRow[], id: string): string[] {
  const out: string[] = []
  for (const row of rows) {
    if (row.parentId !== id) continue
    if (row.hasChildren) out.push(...leafDescendantIds(rows, row.id))
    else out.push(row.id)
  }
  return out
}

export function isLineExcluded(
  excluded: Record<string, boolean>,
  assemblyId: string,
  rowId: string,
): boolean {
  return excluded[qtyBindingKey(assemblyId, rowId)] === true
}

export function groupIncludeState(
  rows: BuildUpRow[],
  excluded: Record<string, boolean>,
  assemblyId: string,
  groupId: string,
): 'all' | 'some' | 'none' {
  const leaves = leafDescendantIds(rows, groupId)
  if (leaves.length === 0) return 'all'
  let included = 0
  for (const id of leaves) {
    if (!isLineExcluded(excluded, assemblyId, id)) included += 1
  }
  if (included === 0) return 'none'
  if (included === leaves.length) return 'all'
  return 'some'
}

export function setLineIncluded(
  excluded: Record<string, boolean>,
  rows: BuildUpRow[],
  assemblyId: string,
  rowId: string,
  included: boolean,
): Record<string, boolean> {
  const row = rows.find((item) => item.id === rowId)
  if (!row) return excluded
  const ids = row.hasChildren ? leafDescendantIds(rows, rowId) : [rowId]
  const next = { ...excluded }
  for (const id of ids) {
    const key = qtyBindingKey(assemblyId, id)
    if (included) delete next[key]
    else next[key] = true
  }
  return next
}
