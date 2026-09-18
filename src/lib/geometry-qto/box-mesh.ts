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

function pushQuad(
  positions: number[],
  indices: number[],
  a: [number, number, number],
  b: [number, number, number],
  c: [number, number, number],
  d: [number, number, number],
) {
  const vertex = positions.length / 3
  positions.push(...a, ...b, ...c, ...d)
  indices.push(vertex, vertex + 1, vertex + 2, vertex, vertex + 2, vertex + 3)
}

/** Axis-aligned box with a rectangular through-opening along +Y (slab hole). */
export function boxMeshWithOpening(
  expressId: number,
  ifcType: string,
  min: [number, number, number],
  max: [number, number, number],
  holeMin: [number, number, number],
  holeMax: [number, number, number],
): QtoMesh {
  const [x0, y0, z0] = min
  const [x1, y1, z1] = max
  const [hx0, , hz0] = holeMin
  const [hx1, , hz1] = holeMax
  const positions: number[] = []
  const indices: number[] = []
  // Outer verticals (same winding as boxMesh).
  pushQuad(positions, indices, [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0])
  pushQuad(positions, indices, [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1])
  pushQuad(positions, indices, [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0])
  pushQuad(positions, indices, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1])
  // Top ring (+Y), hole not filled.
  pushQuad(positions, indices, [x0, y1, z0], [x0, y1, z1], [hx0, y1, z1], [hx0, y1, z0])
  pushQuad(positions, indices, [hx1, y1, z0], [hx1, y1, z1], [x1, y1, z1], [x1, y1, z0])
  pushQuad(positions, indices, [hx0, y1, z0], [hx0, y1, hz0], [hx1, y1, hz0], [hx1, y1, z0])
  pushQuad(positions, indices, [hx0, y1, hz1], [hx0, y1, z1], [hx1, y1, z1], [hx1, y1, hz1])
  // Bottom ring (-Y).
  pushQuad(positions, indices, [x0, y0, z0], [hx0, y0, z0], [hx0, y0, z1], [x0, y0, z1])
  pushQuad(positions, indices, [hx1, y0, z0], [x1, y0, z0], [x1, y0, z1], [hx1, y0, z1])
  pushQuad(positions, indices, [hx0, y0, z0], [hx1, y0, z0], [hx1, y0, hz0], [hx0, y0, hz0])
  pushQuad(positions, indices, [hx0, y0, hz1], [hx1, y0, hz1], [hx1, y0, z1], [hx0, y0, z1])
  // Opening walls: normals into the hole (outward from the solid).
  pushQuad(positions, indices, [hx0, y0, hz0], [hx0, y1, hz0], [hx0, y1, hz1], [hx0, y0, hz1])
  pushQuad(positions, indices, [hx1, y0, hz0], [hx1, y0, hz1], [hx1, y1, hz1], [hx1, y1, hz0])
  pushQuad(positions, indices, [hx0, y0, hz0], [hx1, y0, hz0], [hx1, y1, hz0], [hx0, y1, hz0])
  pushQuad(positions, indices, [hx0, y0, hz1], [hx0, y1, hz1], [hx1, y1, hz1], [hx1, y0, hz1])
  return { expressId, ifcType, positions: new Float32Array(positions), indices: new Uint32Array(indices) }
}
