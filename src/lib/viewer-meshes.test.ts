import type { MeshData } from '@ifc-lite/geometry'
import { boxMesh } from '@/lib/geometry-qto/box-mesh'
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
})
