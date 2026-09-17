import { boxMesh } from '@/lib/geometry-qto/box-mesh'
import {
  ELEMENT_HIDDEN,
  ELEMENT_SELECTED,
  ELEMENT_SOLID,
  ViewerBatchGroup,
} from '@/lib/viewer-batches'
import { describe, expect, it } from 'vitest'

describe('viewer batches', () => {
  it('packs several elements into one draw mesh and maps a triangle back to expressId', () => {
    const group = new ViewerBatchGroup()
    const column = boxMesh(10, 'IfcColumn', [0, 0, 0], [0.4, 3, 0.4])
    const wall = boxMesh(20, 'IfcWall', [2, 0, 0], [4, 3, 0.2])
    group.addRange([column, wall], 0, 2)
    expect(group.drawMeshes).toHaveLength(1)
    const mesh = group.drawMeshes[0]
    expect(group.expressIdAt(mesh, 0)).toBe(10)
    const wallTriangle = (column.indices.length / 3) | 0
    expect(group.expressIdAt(mesh, wallTriangle)).toBe(20)
    expect(group.box.isEmpty()).toBe(false)
    const onlyColumn = group.boxForIds([10])
    expect(onlyColumn.isEmpty()).toBe(false)
    expect(onlyColumn.max.x).toBeLessThan(group.box.max.x)
    group.dispose()
  })

  it('can hide and select packed elements without creating extra meshes', () => {
    const group = new ViewerBatchGroup()
    group.addRange([boxMesh(7, 'IfcSlab', [0, 0, 0], [1, 0.2, 1])], 0, 1)
    group.setElementState(7, ELEMENT_HIDDEN)
    const states = group.drawMeshes[0].geometry.attributes.elementState.array as Float32Array
    expect(states[0]).toBe(ELEMENT_HIDDEN)
    group.setElementState(7, ELEMENT_SELECTED)
    expect(states[0]).toBe(ELEMENT_SELECTED)
    group.setElementState(7, ELEMENT_SOLID)
    expect(group.drawMeshes).toHaveLength(1)
    group.dispose()
  })
})
