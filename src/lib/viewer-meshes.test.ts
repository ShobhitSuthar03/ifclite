import type { MeshData } from '@ifc-lite/geometry'
import { boxMesh } from '@/lib/geometry-qto/box-mesh'
import { FederationRegistry } from '@/lib/federation'
import { createViewerMeshStore } from '@/lib/viewer-meshes'
import { describe, expect, it } from 'vitest'

describe('viewer mesh store', () => {
  it('keeps unique express ids and looks up a selection without scanning every mesh', () => {
    const store = createViewerMeshStore()
    const column = boxMesh(10, 'IfcColumn', [0, 0, 0], [0.4, 3, 0.4]) as MeshData
    const wall = boxMesh(20, 'IfcWall', [2, 0, 0], [4, 3, 0.2]) as MeshData
    store.append([column, wall])
    expect(store.count()).toBe(2)
    expect(store.ids()).toEqual([10, 20])
    expect(store.meshesForIds(new Set([20]))).toEqual([wall])
  })

  it('notifies subscribers on append and clear', () => {
    const store = createViewerMeshStore()
    let ticks = 0
    const stop = store.subscribe(() => {
      ticks += 1
    })
    store.append([boxMesh(1, 'IfcSlab', [0, 0, 0], [1, 0.2, 1]) as MeshData])
    store.clear()
    stop()
    store.append([boxMesh(2, 'IfcSlab', [0, 0, 0], [1, 0.2, 1]) as MeshData])
    expect(ticks).toBe(2)
    expect(store.count()).toBe(1)
  })

  it('globalizes expressId (and geometryItemId/materialId/textureRef.textureId) when fed a federation registry', () => {
    const registry = new FederationRegistry()
    registry.registerModel('a', 'a.ifc', 100)
    registry.registerModel('b', 'b.ifc', 100)

    // Both "files" reuse expressId 10 for a column - the exact case that
    // would otherwise collide once both are loaded into one scene.
    const storeA = createViewerMeshStore({ registry, modelId: 'a' })
    const storeB = createViewerMeshStore({ registry, modelId: 'b' })
    const columnA = boxMesh(10, 'IfcColumn', [0, 0, 0], [0.4, 3, 0.4]) as MeshData
    const columnB = {
      ...(boxMesh(10, 'IfcColumn', [0, 0, 0], [0.4, 3, 0.4]) as MeshData),
      geometryItemId: 5,
      materialId: 7,
      textureRef: { textureId: 3, url: 'x.png', repeatS: false, repeatT: false },
    }
    storeA.append([columnA])
    storeB.append([columnB])

    expect(storeA.ids()).toEqual([10]) // model a got offset 0, unchanged
    expect(storeB.ids()).toEqual([registry.toGlobalId('b', 10)])
    expect(storeB.ids()[0]).not.toBe(10)
    expect(columnB.geometryItemId).toBe(registry.toGlobalId('b', 5))
    expect(columnB.materialId).toBe(registry.toGlobalId('b', 7))
    expect(columnB.textureRef?.textureId).toBe(registry.toGlobalId('b', 3))
  })
})
