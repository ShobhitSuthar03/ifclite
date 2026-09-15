import type { Aabb, Vec2, Vec3 } from '@/lib/geometry-qto/types'

export const EPS = 1e-9

export function vec3(x: number, y: number, z: number): Vec3 {
  return { x, y, z }
}

export function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }
}

export function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }
}

export function scale(a: Vec3, s: number): Vec3 {
  return { x: a.x * s, y: a.y * s, z: a.z * s }
}

export function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  }
}

export function length(a: Vec3): number {
  return Math.hypot(a.x, a.y, a.z)
}

export function normalize(a: Vec3): Vec3 | null {
  const len = length(a)
  if (len < EPS) return null
  return scale(a, 1 / len)
}

export function centroid(points: Vec3[]): Vec3 {
  const n = points.length || 1
  let x = 0
  let y = 0
  let z = 0
  for (const p of points) {
    x += p.x
    y += p.y
    z += p.z
  }
  return { x: x / n, y: y / n, z: z / n }
}

export function emptyAabb(): Aabb {
  return {
    min: { x: Infinity, y: Infinity, z: Infinity },
    max: { x: -Infinity, y: -Infinity, z: -Infinity },
  }
}

export function expandAabb(box: Aabb, p: Vec3): void {
  if (p.x < box.min.x) box.min.x = p.x
  if (p.y < box.min.y) box.min.y = p.y
  if (p.z < box.min.z) box.min.z = p.z
  if (p.x > box.max.x) box.max.x = p.x
  if (p.y > box.max.y) box.max.y = p.y
  if (p.z > box.max.z) box.max.z = p.z
}

export function expandAabbBy(box: Aabb, pad: number): Aabb {
  return {
    min: { x: box.min.x - pad, y: box.min.y - pad, z: box.min.z - pad },
    max: { x: box.max.x + pad, y: box.max.y + pad, z: box.max.z + pad },
  }
}

export function aabbOverlap(a: Aabb, b: Aabb): boolean {
  return a.min.x <= b.max.x && a.max.x >= b.min.x && a.min.y <= b.max.y && a.max.y >= b.min.y && a.min.z <= b.max.z && a.max.z >= b.min.z
}

export function triangleArea(a: Vec3, b: Vec3, c: Vec3): number {
  return length(cross(sub(b, a), sub(c, a))) * 0.5
}

export function vertexKey(p: Vec3, scale = 1000): string {
  return `${Math.round(p.x * scale)}:${Math.round(p.y * scale)}:${Math.round(p.z * scale)}`
}

export function planeKey(normal: Vec3, d: number): string {
  let nx = normal.x
  let ny = normal.y
  let nz = normal.z
  let offset = d
  if (nx < -1e-6 || (Math.abs(nx) < 1e-6 && ny < -1e-6) || (Math.abs(nx) < 1e-6 && Math.abs(ny) < 1e-6 && nz < 0)) {
    nx = -nx
    ny = -ny
    nz = -nz
    offset = -offset
  }
  return `${Math.round(nx * 1000)}:${Math.round(ny * 1000)}:${Math.round(nz * 1000)}:${Math.round(offset * 1000)}`
}

export function planeBasis(normal: Vec3): { u: Vec3; v: Vec3 } {
  const axis = Math.abs(normal.y) < 0.9 ? vec3(0, 1, 0) : vec3(1, 0, 0)
  const u = normalize(cross(axis, normal)) ?? vec3(1, 0, 0)
  const v = cross(normal, u)
  return { u, v }
}

export function to2d(p: Vec3, origin: Vec3, u: Vec3, v: Vec3): Vec2 {
  const d = sub(p, origin)
  return { x: dot(d, u), y: dot(d, v) }
}

export function polygonArea2d(poly: Vec2[]): number {
  if (poly.length < 3) return 0
  let sum = 0
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    sum += a.x * b.y - b.x * a.y
  }
  return sum * 0.5
}

export function ensureCcw(poly: Vec2[]): Vec2[] {
  return polygonArea2d(poly) < 0 ? poly.slice().reverse() : poly
}
