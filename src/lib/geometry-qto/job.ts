import type { Aabb, QtoMesh } from '@/lib/geometry-qto/types'
import { aabbOverlap, emptyAabb, expandAabb, expandAabbBy } from '@/lib/geometry-qto/vec'

const NEIGHBOR_PAD_M = 0.05
const MAX_NEIGHBOR_MESHES = 120

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

function unionAabb(boxes: Aabb[]): Aabb {
  const box = emptyAabb()
  for (const item of boxes) {
    expandAabb(box, item.min)
    expandAabb(box, item.max)
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

/** Selected element meshes plus nearby meshes used only for contact detection. */
export function meshesForQuantityJob(
  meshes: QtoMesh[],
  targetIds: Set<number>,
  maxNeighbors = MAX_NEIGHBOR_MESHES,
): QtoMesh[] {
  return meshesForQuantityIndex(indexMeshAabbs(meshes), targetIds, maxNeighbors)
}

export function meshesForQuantityIndex(
  index: IndexedQtoMesh[],
  targetIds: Set<number>,
  maxNeighbors = MAX_NEIGHBOR_MESHES,
  maxNeighborTriangles = Number.POSITIVE_INFINITY,
): QtoMesh[] {
  const selected = index.filter((item) => targetIds.has(item.mesh.expressId))
  if (selected.length === 0) return []
  const region = expandAabbBy(unionAabb(selected.map((item) => item.aabb)), NEIGHBOR_PAD_M)
  const nearby: QtoMesh[] = []
  let neighborTriangles = 0
  for (const item of index) {
    if (targetIds.has(item.mesh.expressId)) continue
    if (!aabbOverlap(region, item.aabb)) continue
    const triangles = (item.mesh.indices.length / 3) | 0
    if (nearby.length > 0 && neighborTriangles + triangles > maxNeighborTriangles) break
    nearby.push(item.mesh)
    neighborTriangles += triangles
    if (nearby.length >= maxNeighbors) break
  }
  return selected.map((item) => item.mesh).concat(nearby)
}
