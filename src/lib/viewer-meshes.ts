import type { MeshData } from '@ifc-lite/geometry'
import { meshWorldAabb, meshesForQuantityIndex, type IndexedQtoMesh } from '@/lib/geometry-qto/job'
import type { QtoMesh } from '@/lib/geometry-qto/types'

/**
 * CPU mesh list for the viewer and on-demand QTO. Kept outside React state so a
 * large IFC can stream into Three.js without re-rendering the whole app on every
 * geometry batch (that peak is what takes WebView2 down).
 */
export type ViewerMeshStore = {
  append(batch: MeshData[]): void
  clear(): void
  list(): MeshData[]
  count(): number
  revision(): number
  ids(): number[]
  meshesForIds(ids: Set<number>): MeshData[]
  quantitySubset(ids: Set<number>): QtoMesh[]
  subscribe(listener: () => void): () => void
}

export function createViewerMeshStore(): ViewerMeshStore {
  let meshes: MeshData[] = []
  const byId = new Map<number, MeshData[]>()
  const uniqueIds: number[] = []
  let index: IndexedQtoMesh[] = []
  let indexedUntil = 0
  let revision = 0
  const listeners = new Set<() => void>()

  const notify = () => {
    for (const listener of listeners) listener()
  }

  const indexed = (): IndexedQtoMesh[] => {
    while (indexedUntil < meshes.length) {
      const mesh = meshes[indexedUntil] as QtoMesh
      index.push({ mesh, aabb: meshWorldAabb(mesh) })
      indexedUntil += 1
    }
    return index
  }

  return {
    append(batch) {
      if (batch.length === 0) return
      for (const mesh of batch) {
        meshes.push(mesh)
        const list = byId.get(mesh.expressId)
        if (list) list.push(mesh)
        else {
          byId.set(mesh.expressId, [mesh])
          uniqueIds.push(mesh.expressId)
        }
      }
      notify()
    },
    clear() {
      meshes = []
      byId.clear()
      uniqueIds.length = 0
      index = []
      indexedUntil = 0
      revision += 1
      notify()
    },
    list: () => meshes,
    count: () => meshes.length,
    revision: () => revision,
    ids: () => uniqueIds,
    meshesForIds(ids) {
      const out: MeshData[] = []
      for (const id of ids) {
        const list = byId.get(id)
        if (list) out.push(...list)
      }
      return out
    },
    quantitySubset(ids) {
      return meshesForQuantityIndex(indexed(), ids)
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}
