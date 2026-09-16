import type { Aabb, QtoMesh } from '@/lib/geometry-qto/types'
import { emptyAabb, expandAabb } from '@/lib/geometry-qto/vec'

export type IndexedQtoMesh = {
  mesh: QtoMesh
  aabb: Aabb
}

export function meshWorldAabb(mesh: QtoMesh): Aabb {
  const ox = mesh.origin?.[0] ?? 0
  const oy = mesh.origin?.[1] ?? 0
  const oz = mesh.origin?.[2] ?? 0
  const box = emptyAabb()
  const { positions } = mesh
  for (let i = 0; i + 2 < positions.length; i += 3) {
    expandAabb(box, {
      x: positions[i] + ox,
      y: positions[i + 1] + oy,
      z: positions[i + 2] + oz,
    })
  }
  return box
}

export function indexMeshAabbs(meshes: QtoMesh[]): IndexedQtoMesh[] {
  return meshes.map((mesh) => ({ mesh, aabb: meshWorldAabb(mesh) }))
}

/** Fill missing ifcType from parsed IFC / warehouse so takeoff can filter by class. */
export function typeQtoMeshes(
  meshes: QtoMesh[],
  typeOf: (expressId: number) => string | undefined,
): QtoMesh[] {
  return meshes.map((mesh) => {
    if (mesh.ifcType) return mesh
    const ifcType = typeOf(mesh.expressId)
    return ifcType ? { ...mesh, ifcType } : mesh
  })
}

/** Selected element meshes for a takeoff job. */
export function meshesForQuantityJob(meshes: QtoMesh[], targetIds: Set<number>): QtoMesh[] {
  return meshesForQuantityIndex(indexMeshAabbs(meshes), targetIds)
}

export function meshesForQuantityIndex(index: IndexedQtoMesh[], targetIds: Set<number>): QtoMesh[] {
  return index.filter((item) => targetIds.has(item.mesh.expressId)).map((item) => item.mesh)
}
