import * as THREE from 'three'
import type { FaceQuantity } from '@/lib/geometry-qto'
import { FACE_KIND_COLOR } from '@/lib/geometry-qto'

/** Push each classified face slightly off the source mesh so it wins the depth test. */
const FACE_OFFSET_M = 0.01

export type FaceLayer = 'all' | 'lateral' | 'top' | 'bottom'

export function faceMatchesLayer(face: FaceQuantity, layer: FaceLayer): boolean {
  if (layer === 'all') return true
  return face.kind === layer
}

export function faceMatchesLayers(face: FaceQuantity, layers: Set<FaceLayer>): boolean {
  if (layers.size === 0 || layers.has('all')) return true
  for (const layer of layers) {
    if (faceMatchesLayer(face, layer)) return true
  }
  return false
}

export function toggleFaceLayer(current: Set<FaceLayer>, id: FaceLayer): Set<FaceLayer> {
  if (id === 'all') return new Set<FaceLayer>(['all'])
  const next = new Set(current)
  next.delete('all')
  if (next.has(id)) next.delete(id)
  else next.add(id)
  if (next.size === 0) return new Set<FaceLayer>(['all'])
  return next
}

export function overlayFaceColor(face: FaceQuantity, _layers: Set<FaceLayer>): number {
  return FACE_KIND_COLOR[face.kind]
}

export function clearObject3d(group: THREE.Object3D) {
  while (group.children.length) {
    const child = group.children.pop()
    if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) {
      child.geometry.dispose()
      const material = child.material
      if (Array.isArray(material)) material.forEach((item) => item.dispose())
      else material.dispose()
    }
  }
}

function offsetAndWound(positions: ArrayLike<number>, normal: [number, number, number]): Float32Array {
  const [nx, ny, nz] = normal
  const len = Math.hypot(nx, ny, nz) || 1
  const dx = (nx / len) * FACE_OFFSET_M
  const dy = (ny / len) * FACE_OFFSET_M
  const dz = (nz / len) * FACE_OFFSET_M
  const out = new Float32Array(positions.length)
  for (let i = 0; i < positions.length; i += 3) {
    out[i] = positions[i] + dx
    out[i + 1] = positions[i + 1] + dy
    out[i + 2] = positions[i + 2] + dz
  }
  if (out.length < 9) return out
  const ax = out[3] - out[0]
  const ay = out[4] - out[1]
  const az = out[5] - out[2]
  const bx = out[6] - out[0]
  const by = out[7] - out[1]
  const bz = out[8] - out[2]
  const cx = ay * bz - az * by
  const cy = az * bx - ax * bz
  const cz = ax * by - ay * bx
  if (cx * nx + cy * ny + cz * nz >= 0) return out
  for (let i = 0; i < out.length; i += 9) {
    swap3(out, i + 3, i + 6)
  }
  return out
}

function swap3(data: Float32Array, a: number, b: number) {
  const x = data[a]
  const y = data[a + 1]
  const z = data[a + 2]
  data[a] = data[b]
  data[a + 1] = data[b + 1]
  data[a + 2] = data[b + 2]
  data[b] = x
  data[b + 1] = y
  data[b + 2] = z
}

export function addQuantityFaceOverlay(
  group: THREE.Group,
  face: FaceQuantity,
  layers: Set<FaceLayer> | FaceLayer = 'all',
) {
  if (face.positions.length < 9) return
  const set = typeof layers === 'string' ? new Set<FaceLayer>([layers]) : layers
  if (!faceMatchesLayers(face, set)) return
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(offsetAndWound(face.positions, face.normal), 3))
  geometry.computeVertexNormals()
  const material = new THREE.MeshBasicMaterial({
    color: overlayFaceColor(face, set),
    side: THREE.DoubleSide,
    depthTest: true,
    depthWrite: true,
    transparent: false,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.userData.expressId = face.expressId
  mesh.userData.faceId = face.faceId
  mesh.renderOrder = 8
  group.add(mesh)
}

/** Distinct from FACE_KIND_COLOR and CONTACT_FACE_COLOR so a manually gathered
 * "takeoff basket" face reads as a selection, not a classification. A magenta
 * accent rather than the previous yellow - yellow-on-orange (a very common
 * wall/roof material color) has almost no contrast, which is why the outline
 * was hard to spot. */
export const BASKET_FACE_COLOR = 0xec4899
const BASKET_ACCENT_RGB: [number, number, number] = [0.925, 0.282, 0.6] // 0xec4899 as 0..1

/** Manual-basket face highlight - always visible (native or calculated view),
 * unlike addQuantityFaceOverlay which depends on a computed QuantityResult.
 *
 * The fill leans mostly on the element's own material color - it should still
 * read as "this surface," not an unrelated sticker - but with enough accent
 * mixed in, plus a solid-color outline, that a selected face is unmistakable
 * even against a similarly-hued material. */
export function addBasketFaceOverlay(group: THREE.Group, face: FaceQuantity, baseColor?: [number, number, number]) {
  if (face.positions.length < 9) return
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(offsetAndWound(face.positions, face.normal), 3))
  geometry.computeVertexNormals()
  const fillColor = baseColor
    ? new THREE.Color(
        baseColor[0] * 0.75 + BASKET_ACCENT_RGB[0] * 0.25,
        baseColor[1] * 0.75 + BASKET_ACCENT_RGB[1] * 0.25,
        baseColor[2] * 0.75 + BASKET_ACCENT_RGB[2] * 0.25,
      )
    : new THREE.Color(BASKET_FACE_COLOR)
  const material = new THREE.MeshBasicMaterial({
    color: fillColor,
    side: THREE.DoubleSide,
    depthTest: true,
    depthWrite: true,
    transparent: true,
    opacity: baseColor ? 0.5 : 0.6,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.userData.expressId = face.expressId
  mesh.userData.faceId = face.faceId
  mesh.renderOrder = 9
  group.add(mesh)
  const outline = buildFaceOutline(mesh, BASKET_FACE_COLOR)
  outline.renderOrder = 10
  group.add(outline)
}

/** Thin edge outline drawn on top of the overlay mesh for the actively picked face. */
export function buildFaceOutline(mesh: THREE.Mesh, color = 0xffffff): THREE.LineSegments {
  const outline = new THREE.LineSegments(
    new THREE.EdgesGeometry(mesh.geometry),
    new THREE.LineBasicMaterial({ color, toneMapped: false, depthTest: false }),
  )
  outline.renderOrder = 9
  return outline
}
