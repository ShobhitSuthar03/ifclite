import type { MeshData } from '@ifc-lite/geometry'

/**
 * Native `ifc-lite-processing` MeshData is IFC Z-up. WASM MeshDataJs already
 * applies the documented boundary swap `[x, y, z] → [x, z, -y]` (WebGL Y-up).
 * See https://ifclite.dev/docs/tutorials/threejs-integration/
 */
export function isNativePipeline(pipeline: string | undefined): boolean {
  return pipeline?.startsWith('native') === true
}

/** IFC Z-up → WebGL Y-up (same as MeshDataJs / `zup_to_yup`). */
export function zUpToYUp(x: number, y: number, z: number): [number, number, number] {
  return [x, z, -y]
}

export function swapZUpToYUpTripletsInPlace(values: Float32Array): Float32Array {
  for (let i = 0; i < values.length; i += 3) {
    const y = values[i + 1]
    values[i + 1] = values[i + 2]
    values[i + 2] = -y
  }
  return values
}

export function swapZUpToYUpTriplets(source: ArrayLike<number>): Float32Array {
  if (source instanceof Float32Array) return swapZUpToYUpTripletsInPlace(source)
  const out = new Float32Array(source.length)
  for (let i = 0; i < source.length; i += 3) {
    const y = source[i + 1]
    out[i] = source[i]
    out[i + 1] = source[i + 2]
    out[i + 2] = -y
  }
  return out
}

export function meshToWebglYUp(mesh: MeshData): MeshData {
  const positions = swapZUpToYUpTriplets(mesh.positions)
  const normals =
    mesh.normals && mesh.normals.length === mesh.positions.length
      ? swapZUpToYUpTriplets(mesh.normals)
      : mesh.normals
  const origin = mesh.origin ? zUpToYUp(mesh.origin[0], mesh.origin[1], mesh.origin[2]) : mesh.origin
  return { ...mesh, positions, normals: normals ?? mesh.normals, origin }
}

export function meshesToViewerFrame(meshes: MeshData[], pipeline: string | undefined): MeshData[] {
  if (!isNativePipeline(pipeline)) return meshes
  return meshes.map(meshToWebglYUp)
}
