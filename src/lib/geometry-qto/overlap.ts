import { trianglesOverlapArea } from '@/lib/geometry-qto/clip2d'
import type { PlanarFace } from '@/lib/geometry-qto/types'
import { DEFAULT_CONTACT_GAP } from '@/lib/geometry-qto/types'
import { aabbOverlap, expandAabbBy, dot } from '@/lib/geometry-qto/vec'

function planeGap(a: PlanarFace, b: PlanarFace): number {
  // Contact is two elements pressing together: opposite normals, nearly the same plane.
  // Same-facing coplanar faces (slab edge flush with a wall elevation) are not contact.
  const aligned = dot(a.normal, b.normal)
  if (aligned < -0.9) return Math.abs(a.d + b.d)
  return Infinity
}

function cellKey(ix: number, iy: number, iz: number): string {
  return `${ix}:${iy}:${iz}`
}

function cellsFor(face: PlanarFace, cellSize: number, pad: number): string[] {
  const box = expandAabbBy(face.aabb, pad)
  const minX = Math.floor(box.min.x / cellSize)
  const minY = Math.floor(box.min.y / cellSize)
  const minZ = Math.floor(box.min.z / cellSize)
  const maxX = Math.floor(box.max.x / cellSize)
  const maxY = Math.floor(box.max.y / cellSize)
  const maxZ = Math.floor(box.max.z / cellSize)
  const keys: string[] = []
  for (let x = minX; x <= maxX; x += 1) {
    for (let y = minY; y <= maxY; y += 1) {
      for (let z = minZ; z <= maxZ; z += 1) {
        keys.push(cellKey(x, y, z))
      }
    }
  }
  return keys
}

function neighborIndices(faces: PlanarFace[], contactGap: number): Map<number, Set<number>> {
  const cellSize = 1
  const grid = new Map<string, number[]>()
  for (let i = 0; i < faces.length; i += 1) {
    for (const key of cellsFor(faces[i], cellSize, contactGap)) {
      const list = grid.get(key)
      if (list) list.push(i)
      else grid.set(key, [i])
    }
  }
  const neighbors = new Map<number, Set<number>>()
  const add = (a: number, b: number) => {
    if (a === b) return
    const set = neighbors.get(a) ?? new Set<number>()
    set.add(b)
    neighbors.set(a, set)
  }
  for (const list of grid.values()) {
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        add(list[i], list[j])
        add(list[j], list[i])
      }
    }
  }
  return neighbors
}

export type FaceOverlap = {
  overlapArea: number
  overlappingIds: number[]
}

/** Contact area between `face` and other elements' faces. */
export function overlapAgainst(
  face: PlanarFace,
  others: PlanarFace[],
  contactGap = DEFAULT_CONTACT_GAP,
): FaceOverlap {
  const padded = expandAabbBy(face.aabb, contactGap)
  const ids = new Set<number>()
  let area = 0
  for (const other of others) {
    if (other.expressId === face.expressId) continue
    if (!aabbOverlap(padded, other.aabb)) continue
    if (planeGap(face, other) > contactGap) continue
    const hit = trianglesOverlapArea(face.normal, face.triangles[0][0], face.triangles, other.triangles)
    if (hit > 1e-10) {
      area += hit
      ids.add(other.expressId)
    }
  }
  return { overlapArea: area, overlappingIds: [...ids].sort((a, b) => a - b) }
}

export function overlapMap(
  faces: PlanarFace[],
  contactGap = DEFAULT_CONTACT_GAP,
): Map<string, FaceOverlap> {
  const neighbors = neighborIndices(faces, contactGap)
  const result = new Map<string, FaceOverlap>()
  for (let i = 0; i < faces.length; i += 1) {
    const face = faces[i]
    const candidateIdx = neighbors.get(i)
    if (!candidateIdx || candidateIdx.size === 0) {
      result.set(face.faceId, { overlapArea: 0, overlappingIds: [] })
      continue
    }
    const others: PlanarFace[] = []
    for (const j of candidateIdx) others.push(faces[j])
    result.set(face.faceId, overlapAgainst(face, others, contactGap))
  }
  return result
}
