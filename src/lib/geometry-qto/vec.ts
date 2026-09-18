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

/**
 * Collapse points within ~0.1mm of each other to a single instance. Mesh
 * triangle lists reference the same physical corner a different number of
 * times depending on which diagonal each face happened to be split along
 * (box-mesh's own quads do this - two of a quad's four corners get double
 * weight from its triangle split, the other two get single weight); feeding
 * that raw, unevenly-weighted point list into a covariance/PCA fit biases the
 * result away from the shape's true symmetry (a square footprint can come out
 * "oriented" at a spurious 45°). Deduplicating first makes every physical
 * vertex count exactly once, regardless of how the mesh happened to be cut.
 */
function dedupePoints(points: Vec3[]): Vec3[] {
  const seen = new Map<string, Vec3>()
  for (const p of points) {
    const key = vertexKey(p, 10000)
    if (!seen.has(key)) seen.set(key, p)
  }
  return [...seen.values()]
}

/** Principal axes of a point cloud via Jacobi eigen-decomposition of its covariance matrix. */
function principalAxes(points: Vec3[], center: Vec3): [Vec3, Vec3, Vec3] {
  let xx = 0
  let xy = 0
  let xz = 0
  let yy = 0
  let yz = 0
  let zz = 0
  for (const p of points) {
    const dx = p.x - center.x
    const dy = p.y - center.y
    const dz = p.z - center.z
    xx += dx * dx
    xy += dx * dy
    xz += dx * dz
    yy += dy * dy
    yz += dy * dz
    zz += dz * dz
  }
  const n = points.length
  const a = [
    [xx / n, xy / n, xz / n],
    [xy / n, yy / n, yz / n],
    [xz / n, yz / n, zz / n],
  ]
  const v = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ]
  const pairs: [number, number][] = [
    [0, 1],
    [0, 2],
    [1, 2],
  ]
  for (let sweep = 0; sweep < 30; sweep += 1) {
    const off = Math.abs(a[0][1]) + Math.abs(a[0][2]) + Math.abs(a[1][2])
    if (off < 1e-14) break
    for (const [p, q] of pairs) {
      if (Math.abs(a[p][q]) < 1e-15) continue
      const theta = (a[q][q] - a[p][p]) / (2 * a[p][q])
      const t = (theta >= 0 ? 1 : -1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1))
      const c = 1 / Math.sqrt(t * t + 1)
      const s = t * c
      const app = a[p][p]
      const aqq = a[q][q]
      const apq = a[p][q]
      a[p][p] = c * c * app - 2 * s * c * apq + s * s * aqq
      a[q][q] = s * s * app + 2 * s * c * apq + c * c * aqq
      a[p][q] = 0
      a[q][p] = 0
      for (let i = 0; i < 3; i += 1) {
        if (i === p || i === q) continue
        const aip = a[i][p]
        const aiq = a[i][q]
        a[i][p] = c * aip - s * aiq
        a[p][i] = a[i][p]
        a[i][q] = s * aip + c * aiq
        a[q][i] = a[i][q]
      }
      for (let i = 0; i < 3; i += 1) {
        const vip = v[i][p]
        const viq = v[i][q]
        v[i][p] = c * vip - s * viq
        v[i][q] = s * vip + c * viq
      }
    }
  }
  return [vec3(v[0][0], v[1][0], v[2][0]), vec3(v[0][1], v[1][1], v[2][1]), vec3(v[0][2], v[1][2], v[2][2])]
}

export type Obb = { axes: [Vec3, Vec3, Vec3]; extents: [number, number, number] }

/**
 * Oriented bounding box: fit a box to the point cloud's own principal axes
 * (PCA) rather than world axes, so a diagonal/rotated element gets a tight
 * box instead of the inflated axis-aligned one.
 */
export function computeObb(rawPoints: Vec3[]): Obb {
  if (rawPoints.length === 0) return { axes: [vec3(1, 0, 0), vec3(0, 1, 0), vec3(0, 0, 1)], extents: [0, 0, 0] }
  const points = dedupePoints(rawPoints)
  const center = centroid(points)
  const axes = principalAxes(points, center)
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (const p of points) {
    const d = sub(p, center)
    for (let i = 0; i < 3; i += 1) {
      const proj = dot(d, axes[i])
      if (proj < min[i]) min[i] = proj
      if (proj > max[i]) max[i] = proj
    }
  }
  const extents: [number, number, number] = [max[0] - min[0], max[1] - min[1], max[2] - min[2]]
  return { axes, extents }
}

export function obbVolume(points: Vec3[]): number {
  const { extents } = computeObb(points)
  return extents[0] * extents[1] * extents[2]
}

/**
 * Perimeter of the oriented cross-section perpendicular to the element's own
 * longest (extrusion) axis - the "girth" used for painting/wrapping takeoffs
 * (coverage = girth × length), as opposed to a footprint/plan perimeter.
 */
export function obbGirth(points: Vec3[]): number {
  const { extents } = computeObb(points)
  const longest = extents.indexOf(Math.max(...extents))
  const others = [0, 1, 2].filter((i) => i !== longest)
  return 2 * (extents[others[0]] + extents[others[1]])
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

/**
 * Perimeter of the point cloud's oriented (PCA) bounding rectangle within the
 * plane perpendicular to a fixed normal - e.g. the footprint/plan perimeter
 * when normal is "up", regardless of how the element itself is rotated in
 * plan (a diagonal beam or wall still gets its own tight rectangle, not the
 * inflated world-axis-aligned one).
 */
export function orientedPlanePerimeter(rawPoints: Vec3[], normal: Vec3): number {
  if (rawPoints.length === 0) return 0
  const points = dedupePoints(rawPoints)
  const { u: uAxis, v: vAxis } = planeBasis(normal)
  const proj = points.map((p) => to2d(p, vec3(0, 0, 0), uAxis, vAxis))
  const n = proj.length
  let mx = 0
  let my = 0
  for (const p of proj) {
    mx += p.x
    my += p.y
  }
  mx /= n
  my /= n
  let sxx = 0
  let sxy = 0
  let syy = 0
  for (const p of proj) {
    const dx = p.x - mx
    const dy = p.y - my
    sxx += dx * dx
    sxy += dx * dy
    syy += dy * dy
  }
  sxx /= n
  sxy /= n
  syy /= n
  const angle = Math.abs(sxy) > 1e-14 ? 0.5 * Math.atan2(2 * sxy, sxx - syy) : 0
  const ax = { x: Math.cos(angle), y: Math.sin(angle) }
  const ay = { x: -Math.sin(angle), y: Math.cos(angle) }
  let minU = Infinity
  let maxU = -Infinity
  let minV = Infinity
  let maxV = -Infinity
  for (const p of proj) {
    const du = p.x - mx
    const dv = p.y - my
    const pu = du * ax.x + dv * ax.y
    const pv = du * ay.x + dv * ay.y
    if (pu < minU) minU = pu
    if (pu > maxU) maxU = pu
    if (pv < minV) minV = pv
    if (pv > maxV) maxV = pv
  }
  return 2 * (maxU - minU + (maxV - minV))
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
