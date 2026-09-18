import type { MeshData } from '@ifc-lite/geometry'
import { meshWorldAabb, meshesForQuantityIndex, type IndexedQtoMesh } from '@/lib/geometry-qto/job'
import type { QtoMesh } from '@/lib/geometry-qto/types'
import type { FederationRegistry } from '@/lib/federation'

/**
 * Re-homes every id on a mesh that shares expressId's id space onto a
 * model's assigned global range, in place. Mirrors the engine's own design
 * (`@ifc-lite/geometry`'s MeshData.materialId doc comment names this exact
 * function): `geometryItemId`, `materialId`, and `textureRef.textureId` are
 * all local IFC entity references within the same file as expressId, so a
 * federated session must shift them together or they end up pointing at the
 * wrong (or a nonexistent) entity once the offset is applied. `origin`
 * (a float precision translation) and `modelIndex` are untouched - they
 * aren't identifiers.
 */
export function applyFederationOffsetToMesh(mesh: MeshData, registry: FederationRegistry, modelId: string): void {
  mesh.expressId = registry.toGlobalId(modelId, mesh.expressId)
  if (mesh.geometryItemId != null) mesh.geometryItemId = registry.toGlobalId(modelId, mesh.geometryItemId)
  if (mesh.materialId != null) mesh.materialId = registry.toGlobalId(modelId, mesh.materialId)
  if (mesh.textureRef) {
    mesh.textureRef = { ...mesh.textureRef, textureId: registry.toGlobalId(modelId, mesh.textureRef.textureId) }
  }
}

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

/**
 * `federation` globalizes every mesh's ids as they arrive, so a store fed by
 * a model that isn't the first one loaded into the registry doesn't collide
 * with ids already in the scene. Omit it for today's single-model sessions
 * (all current callers) - the store then behaves exactly as before.
 */
export function createViewerMeshStore(federation?: { registry: FederationRegistry; modelId: string }): ViewerMeshStore {
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
        if (federation) applyFederationOffsetToMesh(mesh, federation.registry, federation.modelId)
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
