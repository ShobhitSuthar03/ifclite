import * as THREE from 'three'
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js'

/**
 * Official IFClite threejs-viewer home view: south-west, ~25° elevation.
 * https://github.com/LTplus-AG/ifc-lite/blob/main/examples/threejs-viewer/src/main.ts
 */
export function applyCameraFit(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  root: THREE.Object3D,
): { center: THREE.Vector3; maxDim: number } | null {
  return applyCameraFitBox(camera, controls, new THREE.Box3().setFromObject(root))
}

export function applyCameraFitBox(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  box: THREE.Box3,
): { center: THREE.Vector3; maxDim: number } | null {
  if (box.isEmpty()) return null
  const center = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())
  const maxDim = Math.max(size.x, size.y, size.z)
  if (maxDim <= 0 || !Number.isFinite(maxDim)) return null

  const distance = maxDim * 1.5
  const elevRad = THREE.MathUtils.degToRad(25)
  const planar = Math.cos(elevRad)
  const offset = new THREE.Vector3(
    planar * distance * Math.SQRT1_2,
    Math.sin(elevRad) * distance,
    -planar * distance * Math.SQRT1_2,
  )

  controls.target.copy(center)
  camera.position.copy(center).add(offset)
  camera.near = Math.max(maxDim * 0.001, 0.05)
  camera.far = Math.max(maxDim * 100, 1000)
  camera.updateProjectionMatrix()
  controls.minDistance = Math.max(maxDim * 0.02, 0.2)
  controls.maxDistance = maxDim * 40
  controls.update()

  return { center, maxDim }
}
