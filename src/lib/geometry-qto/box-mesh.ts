import type { QtoMesh } from '@/lib/geometry-qto/types'

/** Axis-aligned box in viewer Y-up space. Each side is two outward triangles. */
export function boxMesh(
  expressId: number,
  ifcType: string,
  min: [number, number, number],
  max: [number, number, number],
): QtoMesh {
  const [x0, y0, z0] = min
  const [x1, y1, z1] = max
  const corners: Array<[number, number, number]> = [
    [x0, y0, z0],
    [x1, y0, z0],
    [x1, y1, z0],
    [x0, y1, z0],
    [x0, y0, z1],
    [x1, y0, z1],
    [x1, y1, z1],
    [x0, y1, z1],
  ]
  // -X, +X, -Y (bottom), +Y (top), -Z, +Z
  const quads: Array<[number, number, number, number]> = [
    [0, 4, 7, 3],
    [1, 2, 6, 5],
    [0, 1, 5, 4],
    [3, 7, 6, 2],
    [0, 3, 2, 1],
    [4, 5, 6, 7],
  ]
  const positions: number[] = []
  const indices: number[] = []
  let vertex = 0
  for (const [a, b, c, d] of quads) {
    positions.push(...corners[a], ...corners[b], ...corners[c], ...corners[d])
    indices.push(vertex, vertex + 1, vertex + 2, vertex, vertex + 2, vertex + 3)
    vertex += 4
  }
  return { expressId, ifcType, positions: new Float32Array(positions), indices: new Uint32Array(indices) }
}
