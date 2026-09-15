import type { Aabb, QtoMesh } from '@/lib/geometry-qto/types'
import { aabbOverlap, emptyAabb, expandAabb, expandAabbBy } from '@/lib/geometry-qto/vec'

const NEIGHBOR_PAD_M = 0.05
const MAX_NEIGHBOR_MESHES = 120

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

/** Selected element meshes plus nearby meshes used only for contact detection. */
export function meshesForQuantityJob(meshes: QtoMesh[], targetIds: Set<number>): QtoMesh[] {
  const selected = meshes.filter((mesh) => targetIds.has(mesh.expressId))
  if (selected.length === 0) return []
  const region = expandAabbBy(
    unionAabb(selected.map(meshWorldAabb)),
    NEIGHBOR_PAD_M,
  )
  const nearby: QtoMesh[] = []
  for (const mesh of meshes) {
    if (targetIds.has(mesh.expressId)) continue
    if (!aabbOverlap(region, meshWorldAabb(mesh))) continue
    nearby.push(mesh)
    if (nearby.length >= MAX_NEIGHBOR_MESHES) break
  }
  return selected.concat(nearby)
}
