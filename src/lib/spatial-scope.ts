import type { SpatialTreeNode } from '@/lib/ifc-data'

export function collectNodeElementIds(node: SpatialTreeNode): number[] {
  const ids: number[] = []
  for (const group of node.elementGroups) ids.push(...group.ids)
  for (const child of node.children) ids.push(...collectNodeElementIds(child))
  return ids
}

export function intersectIds(left: Set<number> | null, right: Set<number> | null): Set<number> | null {
  if (left == null) return right
  if (right == null) return left
  const next = new Set<number>()
  for (const id of left) {
    if (right.has(id)) next.add(id)
  }
  return next
}
