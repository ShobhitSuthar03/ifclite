import { computeElementQuantities, mergeQuantityElements } from '@/lib/geometry-qto/formwork'
import { indexMeshAabbs, meshesForQuantityIndex } from '@/lib/geometry-qto/job'
import type { ElementQuantity, QtoMesh, QuantityResult } from '@/lib/geometry-qto/types'

const DEFAULT_CHUNK = 8
const CHUNK_NEIGHBORS = 48
const MAX_NEIGHBOR_TRIANGLES = 24_000

function yieldMain(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0)
  })
}

function uniqueIdsByPosition(index: ReturnType<typeof indexMeshAabbs>): number[] {
  const seen = new Set<number>()
  const rows: { id: number; x: number; z: number }[] = []
  for (const item of index) {
    const id = item.mesh.expressId
    if (seen.has(id)) continue
    seen.add(id)
    rows.push({
      id,
      x: (item.aabb.min.x + item.aabb.max.x) / 2,
      z: (item.aabb.min.z + item.aabb.max.z) / 2,
    })
  }
  rows.sort((a, b) => a.x - b.x || a.z - b.z)
  return rows.map((row) => row.id)
}

/**
 * Whole-model surface takeoff in small spatial chunks. Numbers only (no triangle
 * soups) so a large IFC does not clone the mesh into JS and take down WebView2.
 */
export async function runWholeModelQuantities(
  meshes: QtoMesh[],
  options?: { chunkSize?: number; signal?: { cancelled: boolean } },
): Promise<QuantityResult> {
  if (meshes.length === 0) return computeElementQuantities([], { keepPositions: false })
  await yieldMain()
  if (options?.signal?.cancelled) return computeElementQuantities([], { keepPositions: false })
  const chunkSize = Math.max(1, options?.chunkSize ?? DEFAULT_CHUNK)
  const index = indexMeshAabbs(meshes)
  const ids = uniqueIdsByPosition(index)
  const elements: ElementQuantity[] = []
  for (let offset = 0; offset < ids.length; offset += chunkSize) {
    if (options?.signal?.cancelled) break
    if (offset > 0) await yieldMain()
    const targetIds = new Set(ids.slice(offset, offset + chunkSize))
    const subset = meshesForQuantityIndex(index, targetIds, CHUNK_NEIGHBORS, MAX_NEIGHBOR_TRIANGLES)
    try {
      const part = computeElementQuantities(subset, { targetIds, keepPositions: false })
      elements.push(...part.elements)
    } catch (caught) {
      console.warn('Surface chunk failed', targetIds, caught)
    }
  }
  return mergeQuantityElements(elements)
}
