import { describe, expect, it } from 'vitest'
import { isGeometryFallbackTree, typeTreeFromMeshes, uniqueIfcTypeTree } from '@/lib/geometry-tree'

describe('geometry tree', () => {
  it('groups unique express ids by IFC type', () => {
    const tree = typeTreeFromMeshes(
      [
        { expressId: 1, ifcType: 'IfcWall' },
        { expressId: 1, ifcType: 'IfcWall' },
        { expressId: 2, ifcType: 'IfcSlab' },
        { expressId: 3, ifcType: 'IfcWall' },
      ],
      'tower.ifc',
    )
    expect(isGeometryFallbackTree(tree)).toBe(true)
    expect(tree.name).toBe('tower')
    expect(tree.totalElements).toBe(3)
    expect(tree.elementGroups.map((group) => [group.typeName, group.ids])).toEqual([
      ['IfcWall', [1, 3]],
      ['IfcSlab', [2]],
    ])
  })

  it('lists unique IFC types for Filters without parsing STEP', () => {
    const nodes = uniqueIfcTypeTree([
      { expressId: 1, ifcType: 'IfcWall' },
      { expressId: 2, ifcType: 'IfcWall' },
      { expressId: 3, ifcType: 'IfcSlab' },
    ])
    expect(nodes.map((node) => [node.label, node.count])).toEqual([
      ['IfcSlab', 1],
      ['IfcWall', 2],
    ])
  })
})
