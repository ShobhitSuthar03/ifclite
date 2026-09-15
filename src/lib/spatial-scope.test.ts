import { describe, expect, it } from 'vitest'
import { IfcTypeEnum } from '@/lib/ifc-data'
import { collectNodeElementIds, intersectIds } from '@/lib/spatial-scope'
import type { SpatialTreeNode } from '@/lib/ifc-data'

function node(
  expressId: number,
  groups: Array<{ typeName: string; ids: number[] }>,
  children: SpatialTreeNode[] = [],
): SpatialTreeNode {
  return {
    expressId,
    name: `#${expressId}`,
    type: IfcTypeEnum.IfcBuildingStorey,
    children,
    elementGroups: groups,
    totalElements: groups.reduce((sum, group) => sum + group.ids.length, 0),
  }
}

describe('collectNodeElementIds', () => {
  it('collects type-group ids from a storey and its children', () => {
    const storey = node(
      10,
      [{ typeName: 'IfcWall', ids: [1, 2] }],
      [node(11, [{ typeName: 'IfcSlab', ids: [3] }])],
    )
    expect(collectNodeElementIds(storey).sort((a, b) => a - b)).toEqual([1, 2, 3])
  })
})

describe('intersectIds', () => {
  it('intersects two scopes', () => {
    expect([...intersectIds(new Set([1, 2, 3]), new Set([2, 3, 4]))!].sort((a, b) => a - b)).toEqual([
      2, 3,
    ])
  })
})
