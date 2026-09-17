import * as THREE from 'three'

/** Packed GPU batches: a large IFC becomes a handful of draw calls, not one Mesh per element. */
export const ELEMENT_HIDDEN = 0
export const ELEMENT_SOLID = 1
export const ELEMENT_GHOST = 2
export const ELEMENT_SELECTED = 3
export const ELEMENT_HOVER = 4

const VERT_CAP = 80_000
const INDEX_CAP = 240_000

type PackedBatch = {
  mesh: THREE.Mesh
  positions: Float32Array
  colors: Float32Array
  states: Float32Array
  indices: Uint32Array
  triangleIds: Int32Array
  usedVerts: number
  usedIndices: number
  usedTriangles: number
  vertCap: number
}

type Span = {
  expressId: number
  batch: PackedBatch
  vertexStart: number
  vertexCount: number
  baseR: number
  baseG: number
  baseB: number
}

const DEFAULT_RGB: [number, number, number] = [0.72, 0.74, 0.78]

export class ViewerBatchGroup {
  readonly object = new THREE.Group()
  readonly box = new THREE.Box3()
  private readonly material: THREE.MeshLambertMaterial
  private readonly batches: PackedBatch[] = []
  private readonly spansById = new Map<number, Span[]>()
  private current: PackedBatch | null = null
  private readonly elementState = new Map<number, number>()

  constructor() {
    this.object.name = 'ifc-batched'
    this.material = createBatchMaterial()
    this.box.makeEmpty()
  }

  get drawMeshes(): THREE.Mesh[] {
    return this.batches.map((batch) => batch.mesh)
  }

  boxForIds(ids: Iterable<number>): THREE.Box3 {
    const box = new THREE.Box3()
    const point = new THREE.Vector3()
    for (const id of ids) {
      const spans = this.spansById.get(id)
      if (!spans) continue
      for (const span of spans) {
        const positions = span.batch.positions
        const end = span.vertexStart + span.vertexCount
        for (let i = span.vertexStart; i < end; i += 1) {
          const o = i * 3
          point.set(positions[o], positions[o + 1], positions[o + 2])
          box.expandByPoint(point)
        }
      }
    }
    return box
  }

  clear() {
    for (const batch of this.batches) {
      batch.mesh.geometry.dispose()
      this.object.remove(batch.mesh)
    }
    this.batches.length = 0
    this.current = null
    this.spansById.clear()
    this.elementState.clear()
    this.box.makeEmpty()
  }

  dispose() {
    this.clear()
    this.material.dispose()
  }

  addRange(meshes: Array<{ positions: ArrayLike<number>; indices: ArrayLike<number>; origin?: ArrayLike<number>; color?: ArrayLike<number>; expressId: number }>, from: number, to: number) {
    const dirty = new Set<PackedBatch>()
    for (let i = from; i < to; i += 1) {
      this.addMesh(meshes[i])
      if (this.current) dirty.add(this.current)
    }
    for (const batch of dirty) this.syncGpu(batch)
  }

  expressIdAt(object: THREE.Object3D, faceIndex: number): number | null {
    const ids = object.userData.triangleIds as Int32Array | undefined
    if (!ids || faceIndex < 0 || faceIndex >= ids.length) return null
    const id = ids[faceIndex]
    return id >= 0 ? id : null
  }

  setElementState(expressId: number, state: number) {
    if (this.elementState.get(expressId) === state) return
    this.elementState.set(expressId, state)
    const spans = this.spansById.get(expressId)
    if (!spans) return
    for (const span of spans) {
      fillRange(span.batch.states, span.vertexStart, span.vertexCount, state)
      span.batch.mesh.geometry.attributes.elementState.needsUpdate = true
    }
  }

  setElementColor(expressId: number, rgb: [number, number, number] | null) {
    const spans = this.spansById.get(expressId)
    if (!spans) return
    const [r, g, b] = rgb ?? [spans[0].baseR, spans[0].baseG, spans[0].baseB]
    for (const span of spans) {
      const colors = span.batch.colors
      const end = (span.vertexStart + span.vertexCount) * 3
      for (let i = span.vertexStart * 3; i < end; i += 3) {
        colors[i] = r
        colors[i + 1] = g
        colors[i + 2] = b
      }
      span.batch.mesh.geometry.attributes.color.needsUpdate = true
    }
  }

  private addMesh(mesh: { positions: ArrayLike<number>; indices: ArrayLike<number>; origin?: ArrayLike<number>; color?: ArrayLike<number>; expressId: number }) {
    const vertCount = (mesh.positions.length / 3) | 0
    const indexCount = mesh.indices.length
    if (vertCount < 3 || indexCount < 3) return
    const triangleCount = (indexCount / 3) | 0
    let batch = this.current
    if (!batch || batch.usedVerts + vertCount > batch.vertCap || batch.usedIndices + indexCount > INDEX_CAP) {
      batch = this.newBatch(Math.max(VERT_CAP, vertCount), Math.max(INDEX_CAP, indexCount))
      this.current = batch
    }
    const vertexStart = batch.usedVerts
    copyPositions(batch.positions, vertexStart * 3, mesh.positions, mesh.origin, this.box)
    const [r, g, b] = mesh.color && mesh.color.length >= 3 ? [mesh.color[0], mesh.color[1], mesh.color[2]] : DEFAULT_RGB
    fillRgb(batch.colors, vertexStart, vertCount, r, g, b)
    fillRange(batch.states, vertexStart, vertCount, ELEMENT_SOLID)
    copyIndices(batch.indices, batch.usedIndices, mesh.indices, vertexStart)
    const triangleStart = batch.usedTriangles
    for (let t = 0; t < triangleCount; t += 1) batch.triangleIds[triangleStart + t] = mesh.expressId
    batch.usedVerts += vertCount
    batch.usedIndices += triangleCount * 3
    batch.usedTriangles += triangleCount
    const span: Span = {
      expressId: mesh.expressId,
      batch,
      vertexStart,
      vertexCount: vertCount,
      baseR: r,
      baseG: g,
      baseB: b,
    }
    const list = this.spansById.get(mesh.expressId)
    if (list) list.push(span)
    else this.spansById.set(mesh.expressId, [span])
  }

  private newBatch(vertCap: number, indexCap: number): PackedBatch {
    const geometry = new THREE.BufferGeometry()
    const positions = new Float32Array(vertCap * 3)
    const colors = new Float32Array(vertCap * 3)
    const states = new Float32Array(vertCap)
    const indices = new Uint32Array(indexCap)
    const triangleIds = new Int32Array((indexCap / 3) | 0)
    triangleIds.fill(-1)
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    geometry.setAttribute('elementState', new THREE.BufferAttribute(states, 1))
    geometry.setIndex(new THREE.BufferAttribute(indices, 1))
    geometry.setDrawRange(0, 0)
    const mesh = new THREE.Mesh(geometry, this.material)
    mesh.castShadow = false
    mesh.receiveShadow = false
    mesh.frustumCulled = true
    mesh.userData.triangleIds = triangleIds
    this.object.add(mesh)
    const batch: PackedBatch = {
      mesh,
      positions,
      colors,
      states,
      indices,
      triangleIds,
      usedVerts: 0,
      usedIndices: 0,
      usedTriangles: 0,
      vertCap,
    }
    this.batches.push(batch)
    return batch
  }

  private syncGpu(batch: PackedBatch) {
    const geometry = batch.mesh.geometry
    const position = geometry.attributes.position
    const color = geometry.attributes.color
    const state = geometry.attributes.elementState
    const index = geometry.index
    setAttrCount(position as THREE.BufferAttribute, batch.usedVerts)
    setAttrCount(color as THREE.BufferAttribute, batch.usedVerts)
    setAttrCount(state as THREE.BufferAttribute, batch.usedVerts)
    if (index) setAttrCount(index, batch.usedIndices)
    geometry.setDrawRange(0, batch.usedIndices)
    position.needsUpdate = true
    color.needsUpdate = true
    state.needsUpdate = true
    if (index) index.needsUpdate = true
    geometry.computeBoundingSphere()
    geometry.computeBoundingBox()
  }
}

function createBatchMaterial(): THREE.MeshLambertMaterial {
  const material = new THREE.MeshLambertMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    flatShading: true,
  })
  material.customProgramCacheKey = () => 'ifc-batched-element-state'
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
         attribute float elementState;
         varying float vElementState;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         vElementState = elementState;`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         varying float vElementState;`,
      )
      .replace(
        'void main() {',
        `void main() {
         if (vElementState < 0.5) discard;`,
      )
      .replace(
        '#include <opaque_fragment>',
        `if (vElementState > 1.5 && vElementState < 2.5) {
           outgoingLight = mix(outgoingLight, vec3(0.88), 0.88);
         } else if (vElementState > 2.5 && vElementState < 3.5) {
           outgoingLight = mix(outgoingLight, vec3(1.0, 0.84, 0.08), 0.72);
         } else if (vElementState > 3.5) {
           outgoingLight = mix(outgoingLight, vec3(1.0, 0.92, 0.35), 0.4);
         }
         #include <opaque_fragment>`,
      )
  }
  return material
}

function copyPositions(
  dest: Float32Array,
  destOffset: number,
  source: ArrayLike<number>,
  origin: ArrayLike<number> | undefined,
  box: THREE.Box3,
) {
  const ox = origin?.[0] ?? 0
  const oy = origin?.[1] ?? 0
  const oz = origin?.[2] ?? 0
  for (let i = 0; i + 2 < source.length; i += 3) {
    const x = source[i] + ox
    const y = source[i + 1] + oy
    const z = source[i + 2] + oz
    dest[destOffset + i] = x
    dest[destOffset + i + 1] = y
    dest[destOffset + i + 2] = z
    box.min.x = Math.min(box.min.x, x)
    box.min.y = Math.min(box.min.y, y)
    box.min.z = Math.min(box.min.z, z)
    box.max.x = Math.max(box.max.x, x)
    box.max.y = Math.max(box.max.y, y)
    box.max.z = Math.max(box.max.z, z)
  }
}

function copyIndices(dest: Uint32Array, destOffset: number, source: ArrayLike<number>, vertexOffset: number) {
  const triangles = (source.length / 3) | 0
  for (let i = 0; i < triangles * 3; i += 1) dest[destOffset + i] = (source[i] | 0) + vertexOffset
}

function fillRgb(dest: Float32Array, vertexStart: number, vertexCount: number, r: number, g: number, b: number) {
  const end = (vertexStart + vertexCount) * 3
  for (let i = vertexStart * 3; i < end; i += 3) {
    dest[i] = r
    dest[i + 1] = g
    dest[i + 2] = b
  }
}

function fillRange(dest: Float32Array, vertexStart: number, vertexCount: number, value: number) {
  const end = vertexStart + vertexCount
  dest.fill(value, vertexStart, end)
}

function setAttrCount(attr: THREE.BufferAttribute, count: number) {
  ;(attr as unknown as { count: number }).count = count
}

void DEFAULT_RGB
