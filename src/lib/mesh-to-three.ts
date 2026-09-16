import * as THREE from 'three'
import type { MeshData } from '@ifc-lite/geometry'

/** Convert MeshData the way the IFClite Three.js tutorial specifies. */
export function meshDataToThree(mesh: MeshData): THREE.Mesh {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3))
  const hasNormals = Boolean(mesh.normals && mesh.normals.length === mesh.positions.length)
  if (hasNormals) {
    geometry.setAttribute('normal', new THREE.BufferAttribute(mesh.normals, 3))
  }
  geometry.setIndex(new THREE.BufferAttribute(mesh.indices, 1))
  geometry.computeBoundingSphere()

  const [r, g, b, a] = mesh.color ?? [0.72, 0.74, 0.78, 1]
  const material = new THREE.MeshLambertMaterial({
    color: new THREE.Color(r, g, b),
    transparent: a < 1,
    opacity: a,
    side: THREE.DoubleSide,
    depthWrite: a >= 1,
    flatShading: !hasNormals,
  })

  const threeMesh = new THREE.Mesh(geometry, material)
  threeMesh.userData.baseColor = material.color.clone()
  // Fold the per-element local-frame origin (world = origin + positions).
  if (mesh.origin) threeMesh.position.fromArray(mesh.origin)
  threeMesh.userData.expressId = mesh.expressId
  threeMesh.userData.ifcType = mesh.ifcType
  threeMesh.castShadow = false
  threeMesh.receiveShadow = false
  return threeMesh
}
