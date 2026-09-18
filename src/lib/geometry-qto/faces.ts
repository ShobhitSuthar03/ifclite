import type { FaceKind, PlanarFace, QtoMesh, Vec3 } from '@/lib/geometry-qto/types'
import { DEFAULT_HORIZONTAL_DOT, VIEWER_UP } from '@/lib/geometry-qto/types'
import {
  centroid,
  cross,
  dot,
  emptyAabb,
  expandAabb,
  normalize,
  scale,
  sub,
  triangleArea,
  vec3,
  vertexKey,
} from '@/lib/geometry-qto/vec'

type RawTri = {
  a: Vec3
  b: Vec3
  c: Vec3
  normal: Vec3
  d: number
  area: number
}

function readVertex(positions: ArrayLike<number>, index: number, origin: Vec3): Vec3 {
  const i = index * 3
  return {
    x: positions[i] + origin.x,
    y: positions[i + 1] + origin.y,
    z: positions[i + 2] + origin.z,
  }
}

function originOf(mesh: QtoMesh): Vec3 {
  const o = mesh.origin
  if (!o) return vec3(0, 0, 0)
  return vec3(o[0] ?? 0, o[1] ?? 0, o[2] ?? 0)
}

function classifyKind(normal: Vec3, up: Vec3, horizontalDot: number): FaceKind {
  const along = dot(normal, up)
  if (along > horizontalDot) return 'top'
  if (along < -horizontalDot) return 'bottom'
  return 'lateral'
}

function areaCentroid(tris: RawTri[]): Vec3 {
  let x = 0
  let y = 0
  let z = 0
  let weight = 0
  for (const tri of tris) {
    const c = centroid([tri.a, tri.b, tri.c])
    x += c.x * tri.area
    y += c.y * tri.area
    z += c.z * tri.area
    weight += tri.area
  }
  if (weight < 1e-12) return vec3(0, 0, 0)
  return vec3(x / weight, y / weight, z / weight)
}

function flipTriangles(triangles: [Vec3, Vec3, Vec3][]): [Vec3, Vec3, Vec3][] {
  return triangles.map(([a, b, c]) => [a, c, b])
}

function meshTriangles(mesh: QtoMesh): RawTri[] {
  const origin = originOf(mesh)
  const { positions, indices } = mesh
  const tris: RawTri[] = []
  const count = Math.floor(indices.length / 3)
  for (let t = 0; t < count; t += 1) {
    const a = readVertex(positions, indices[t * 3], origin)
    const b = readVertex(positions, indices[t * 3 + 1], origin)
    const c = readVertex(positions, indices[t * 3 + 2], origin)
    const n = normalize(cross(sub(b, a), sub(c, a)))
    const area = triangleArea(a, b, c)
    if (!n || area < 1e-12) continue
    const d = dot(n, a)
    tris.push({ a, b, c, normal: n, d, area })
  }
  return tris
}

function unionFind(size: number): { find: (i: number) => number; union: (a: number, b: number) => void } {
  const parent = Array.from({ length: size }, (_, i) => i)
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]]
      i = parent[i]
    }
    return i
  }
  const union = (a: number, b: number) => {
    const pa = find(a)
    const pb = find(b)
    if (pa !== pb) parent[pb] = pa
  }
  return { find, union }
}

// A tessellator's per-triangle normal/offset carries floating-point noise, so
// two triangles that are visually one continuous flat surface can land in
// different rounded plane buckets and never merge (#faces-not-correctly-
// selected: the QTO click-to-highlight would then only light up part of the
// surface). Comparing each *shared edge* against an angle + distance
// tolerance - instead of requiring an exact quantized-plane-key match - fixes
// that without merging across a real fold (a hip/valley roof edge or a
// wall/roof corner is many degrees away from this 2° budget).
const COPLANAR_ANGLE_COS = Math.cos((2 * Math.PI) / 180)
const COPLANAR_DISTANCE_TOL_M = 0.005

function isCoplanarPair(a: RawTri, b: RawTri): boolean {
  if (dot(a.normal, b.normal) < COPLANAR_ANGLE_COS) return false
  const centroidA = centroid([a.a, a.b, a.c])
  return Math.abs(dot(a.normal, centroidA) - b.d) < COPLANAR_DISTANCE_TOL_M
}

function connectCoplanar(tris: RawTri[]): number[] {
  const { find, union } = unionFind(tris.length)
  const edgeOwner = new Map<string, number>()
  for (let i = 0; i < tris.length; i += 1) {
    const tri = tris[i]
    const verts = [tri.a, tri.b, tri.c]
    for (let e = 0; e < 3; e += 1) {
      const ka = vertexKey(verts[e])
      const kb = vertexKey(verts[(e + 1) % 3])
      const edge = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`
      const other = edgeOwner.get(edge)
      if (other == null) {
        edgeOwner.set(edge, i)
      } else if (isCoplanarPair(tri, tris[other])) {
        union(i, other)
      }
    }
  }
  return tris.map((_, i) => find(i))
}

function buildFace(
  expressId: number,
  ifcType: string,
  localIndex: number,
  members: RawTri[],
  bodyCenter: Vec3,
  up: Vec3,
  horizontalDot: number,
): PlanarFace | null {
  let area = 0
  let nx = 0
  let ny = 0
  let nz = 0
  const aabb = emptyAabb()
  const triangles: [Vec3, Vec3, Vec3][] = []
  const points: Vec3[] = []
  for (const tri of members) {
    area += tri.area
    nx += tri.normal.x * tri.area
    ny += tri.normal.y * tri.area
    nz += tri.normal.z * tri.area
    expandAabb(aabb, tri.a)
    expandAabb(aabb, tri.b)
    expandAabb(aabb, tri.c)
    triangles.push([tri.a, tri.b, tri.c])
    points.push(tri.a, tri.b, tri.c)
  }
  if (area < 1e-10) return null
  let normal = normalize(vec3(nx, ny, nz)) ?? members[0].normal
  const center = centroid(points)
  const flipped = dot(normal, sub(center, bodyCenter)) < 0
  if (flipped) normal = scale(normal, -1)
  const d = dot(normal, center)
  return {
    faceId: `${expressId}:${localIndex}`,
    expressId,
    ifcType,
    kind: classifyKind(normal, up, horizontalDot),
    normal,
    d,
    area,
    aabb,
    triangles: flipped ? flipTriangles(triangles) : triangles,
  }
}

export function extractFaces(
  meshes: QtoMesh[],
  options?: { up?: Vec3; horizontalDot?: number },
): PlanarFace[] {
  const up = options?.up ?? VIEWER_UP
  const horizontalDot = options?.horizontalDot ?? DEFAULT_HORIZONTAL_DOT
  const byId = new Map<number, { ifcType: string; tris: RawTri[] }>()
  for (const mesh of meshes) {
    const ifcType = mesh.ifcType || 'IfcProduct'
    const bucket = byId.get(mesh.expressId)
    const tris = meshTriangles(mesh)
    if (bucket) {
      bucket.tris.push(...tris)
      if (!bucket.ifcType || bucket.ifcType === 'IfcProduct') bucket.ifcType = ifcType
    } else {
      byId.set(mesh.expressId, { ifcType, tris })
    }
  }

  const faces: PlanarFace[] = []
  for (const [expressId, { ifcType, tris }] of byId) {
    if (tris.length === 0) continue
    const roots = connectCoplanar(tris)
    const groups = new Map<number, RawTri[]>()
    for (let i = 0; i < tris.length; i += 1) {
      const root = roots[i]
      const list = groups.get(root) ?? []
      list.push(tris[i])
      groups.set(root, list)
    }
    let local = 0
    const bodyCenter = areaCentroid(tris)
    for (const members of groups.values()) {
      const face = buildFace(expressId, ifcType, local, members, bodyCenter, up, horizontalDot)
      if (face) {
        faces.push(face)
        local += 1
      }
    }
  }
  return faces
}

export function isColumnType(ifcType: string | undefined): boolean {
  return Boolean(ifcType && /column/i.test(ifcType))
}

export function isBuildingElementType(ifcType: string | undefined): boolean {
  // 'IfcProduct' is the sentinel extractFaces() substitutes when a mesh carries no
  // ifcType (e.g. desktop's packed geometry cache, which doesn't roundtrip the type).
  // It is an abstract IFC class no real element ever reports, so treat it the same
  // as "unknown" rather than letting it fail every type-name check below.
  if (!ifcType || ifcType === 'IfcProduct') return true
  if (/openingelement|ifcspace\b|ifcsite\b|ifcproject\b|ifcbuildingstorey|annotation|ifcgrid\b|distribution|flowterminal|furnishing|spatialzone|virtualelement/i.test(ifcType)) {
    return false
  }
  return /wall|column|beam|slab|roof|stair|ramp|member|plate|footing|pile|door|window|covering|railing|chimney|curtain|shading|buildingelement|elementassembly|reinforc|tendon|fastener|course|strut|caisson|kerb|pavement|deepfoundation|proxy/i.test(
    ifcType,
  )
}
