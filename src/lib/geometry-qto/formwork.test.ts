import { extractFaces } from '@/lib/geometry-qto/faces'
import { boxMesh } from '@/lib/geometry-qto/box-mesh'
import { computeColumnFormwork, computeElementQuantities, hydrateFacePositions } from '@/lib/geometry-qto/formwork'
import { isBuildingElementType } from '@/lib/geometry-qto/faces'
import { meshesForQuantityJob, typeQtoMeshes } from '@/lib/geometry-qto/job'
import { runWholeModelQuantities } from '@/lib/geometry-qto/run-qto'
import { DEFAULT_CONTACT_GAP } from '@/lib/geometry-qto/types'
import { describe, expect, it } from 'vitest'

function almost(value: number, expected: number, eps = 1e-6) {
  expect(value).toBeCloseTo(expected, Math.round(-Math.log10(eps)))
}

describe('extractFaces', () => {
  it('merges coplanar triangles on each side of a box into one face', () => {
    const mesh = boxMesh(1, 'IfcColumn', [0, 0, 0], [0.4, 3, 0.4])
    const faces = extractFaces([mesh])
    expect(faces).toHaveLength(6)
    const laterals = faces.filter((face) => face.kind === 'lateral')
    const horizontal = faces.filter((face) => face.kind !== 'lateral')
    expect(laterals).toHaveLength(4)
    expect(horizontal).toHaveLength(2)
    for (const face of laterals) almost(face.area, 0.4 * 3)
    for (const face of horizontal) almost(face.area, 0.4 * 0.4)
    const top = faces.find((face) => face.kind === 'top')
    const bottom = faces.find((face) => face.kind === 'bottom')
    expect(top?.normal.y).toBeGreaterThan(0.9)
    expect(bottom?.normal.y).toBeLessThan(-0.9)
  })

  it('still treats the high face as TOPAREA when triangle winding is inward', () => {
    const mesh = boxMesh(1, 'IfcWall', [0, 0, 0], [4, 3, 0.2])
    const indices = Uint32Array.from(mesh.indices)
    for (let i = 0; i + 2 < indices.length; i += 3) {
      const swap = indices[i + 1]
      indices[i + 1] = indices[i + 2]
      indices[i + 2] = swap
    }
    const faces = extractFaces([{ ...mesh, indices }])
    const top = faces.find((face) => face.kind === 'top')
    const bottom = faces.find((face) => face.kind === 'bottom')
    expect(top).toBeTruthy()
    expect(bottom).toBeTruthy()
    expect(top!.aabb.min.y).toBeGreaterThan(2.5)
    expect(bottom!.aabb.max.y).toBeLessThan(0.5)
    expect(top!.normal.y).toBeGreaterThan(0.9)
    expect(bottom!.normal.y).toBeLessThan(-0.9)
  })
})

describe('isBuildingElementType', () => {
  it('accepts walls, slabs, beams, and proxies', () => {
    expect(isBuildingElementType('IfcWallStandardCase')).toBe(true)
    expect(isBuildingElementType('IfcSlab')).toBe(true)
    expect(isBuildingElementType('IfcBeam')).toBe(true)
    expect(isBuildingElementType('IfcBuildingElementProxy')).toBe(true)
  })

  it('rejects spaces and openings', () => {
    expect(isBuildingElementType('IfcSpace')).toBe(false)
    expect(isBuildingElementType('IfcOpeningElement')).toBe(false)
  })

  it('fails open for meshes with no known ifcType, such as desktop packed-cache geometry', () => {
    expect(isBuildingElementType(undefined)).toBe(true)
    expect(isBuildingElementType('IfcProduct')).toBe(true)
  })
})

describe('computeElementQuantities', () => {
  it('still includes elements when ifcType is missing (desktop packed geometry cache)', () => {
    const column = boxMesh(10, 'IfcColumn', [0, 0, 0], [0.4, 3, 0.4])
    const { ifcType: _ifcType, ...untyped } = column
    void _ifcType
    const result = computeElementQuantities([untyped])
    expect(result.elementCount).toBe(1)
    almost(result.elements[0].metrics.VOLUME, 0.48)
    expect(result.elements[0].faces.some((face) => face.positions.length > 0)).toBe(true)
  })

  it('typeQtoMeshes fills missing IFC class names from a lookup', () => {
    const column = boxMesh(10, 'IfcColumn', [0, 0, 0], [0.4, 3, 0.4])
    const { ifcType: _ifcType, ...untyped } = column
    void _ifcType
    const typed = typeQtoMeshes([untyped], (id) => (id === 10 ? 'IfcWall' : undefined))
    expect(typed[0]?.ifcType).toBe('IfcWall')
  })

  it('fills area metrics for an isolated rectangular column', () => {
    const column = boxMesh(10, 'IfcColumn', [0, 0, 0], [0.4, 3, 0.4])
    const result = computeElementQuantities([column])
    expect(result.elementCount).toBe(1)
    const m = result.elements[0].metrics
    almost(m.LATERALAREA, 4.8)
    almost(m.TOPAREA, 0.16)
    almost(m.UNDERAREA, 0.16)
    almost(m.GROSSAREA, 5.12)
    almost(m.FOOTPRINTAREA, 0.16)
    almost(m.CROSSAREA, 0.16)
    almost(m.AREAMAX, 1.2)
    almost(m.AREAMIN, 0.16)
    almost(m.COVEREDAREA, 0)
    almost(m.UNCOVEREDAREA, 5.12)
    almost(m.VOLUME, 0.48)
    almost(m.HEIGHT, 3)
    almost(m.LENGTH, 0.4)
    almost(m.WIDTH, 0.4)
    almost(m.COUNT, 1)
  })

  it('computes wall laterals and slab top/under', () => {
    const wall = boxMesh(1, 'IfcWall', [0, 0, 0], [4, 3, 0.2])
    const slab = boxMesh(2, 'IfcSlab', [0, 3, 0], [4, 3.2, 5])
    const result = computeElementQuantities([wall, slab])
    const wallM = result.elements.find((item) => item.expressId === 1)?.metrics
    const slabM = result.elements.find((item) => item.expressId === 2)?.metrics
    expect(wallM && slabM).toBeTruthy()
    almost(wallM!.LATERALAREA, 2 * (4 * 3 + 0.2 * 3))
    almost(slabM!.TOPAREA, 4 * 5)
    almost(slabM!.UNDERAREA, 4 * 5)
    almost(slabM!.FOOTPRINTAREA, 4 * 5)
  })

  it('subtracts shared contact from both a column and a flush wall', () => {
    const column = boxMesh(10, 'IfcColumn', [0, 0, 0], [0.4, 3, 0.4])
    const wall = boxMesh(20, 'IfcWall', [0.4, 0, 0], [0.6, 3, 0.4])
    const result = computeElementQuantities([column, wall])
    const col = result.elements.find((item) => item.expressId === 10)!
    const shared = 0.4 * 3
    almost(col.metrics.COVEREDAREA, shared)
    almost(col.metrics.UNCOVEREDAREA, 5.12 - shared)
    almost(col.metrics.LATERALAREA, 4.8)
    const hit = col.faces.find((face) => face.overlapArea > 1e-6)
    expect(hit?.overlappingIds).toEqual([20])
  })

  it('does not subtract when the gap is larger than the contact epsilon', () => {
    const column = boxMesh(10, 'IfcColumn', [0, 0, 0], [0.4, 3, 0.4])
    const wall = boxMesh(20, 'IfcWall', [0.4 + 0.01, 0, 0], [0.6, 3, 0.4])
    const result = computeElementQuantities([column, wall], { contactGap: DEFAULT_CONTACT_GAP })
    almost(result.elements[0].metrics.COVEREDAREA, 0)
  })

  it('subtracts when the gap is within the contact epsilon', () => {
    const column = boxMesh(10, 'IfcColumn', [0, 0, 0], [0.4, 3, 0.4])
    const wall = boxMesh(20, 'IfcWall', [0.4 + 0.003, 0, 0], [0.6, 3, 0.4])
    const result = computeElementQuantities([column, wall], { contactGap: DEFAULT_CONTACT_GAP })
    almost(result.elements[0].metrics.COVEREDAREA, 0.4 * 3)
  })

  it('does not mark a slab edge covered just because a wall is flush with that elevation', () => {
    const slab = boxMesh(1, 'IfcSlab', [0, 0, 0], [4, 0.2, 5])
    const wall = boxMesh(2, 'IfcWall', [0, 0.2, 0], [4, 3.2, 0.2])
    const result = computeElementQuantities([slab, wall])
    const slabEl = result.elements.find((item) => item.expressId === 1)!
    for (const face of slabEl.faces.filter((item) => item.kind === 'lateral')) {
      almost(face.overlapArea, 0)
    }
    const top = slabEl.faces.find((item) => item.kind === 'top')!
    almost(top.overlapArea, 4 * 0.2)
  })

  it('applies mesh origin when assembling world-space faces', () => {
    const local = boxMesh(10, 'IfcColumn', [0, 0, 0], [0.4, 3, 0.4])
    const shifted = {
      ...local,
      origin: [2, 0, 1] as [number, number, number],
    }
    const wall = boxMesh(20, 'IfcWall', [2.4, 0, 1], [2.6, 3, 1.4])
    const result = computeElementQuantities([shifted, wall])
    almost(result.elements[0].metrics.COVEREDAREA, 0.4 * 3)
  })
})

describe('computeColumnFormwork', () => {
  it('reports lateral-only column formwork', () => {
    const column = boxMesh(10, 'IfcColumn', [0, 0, 0], [0.4, 3, 0.4])
    const result = computeColumnFormwork([column])
    expect(result.columnCount).toBe(1)
    expect(result.elements[0].faces).toHaveLength(4)
    almost(result.grossArea, 4.8)
  })
})

describe('on-demand selection takeoff', () => {
  it('keeps the selected column and nearby wall for contact, but emits only the target', () => {
    const column = boxMesh(10, 'IfcColumn', [0, 0, 0], [0.4, 3, 0.4])
    const wall = boxMesh(20, 'IfcWall', [0.4, 0, 0], [0.6, 3, 0.4])
    const far = boxMesh(30, 'IfcWall', [20, 0, 20], [24, 3, 20.2])
    const subset = meshesForQuantityJob([column, wall, far], new Set([10]))
    expect(subset.map((mesh) => mesh.expressId).sort((a, b) => a - b)).toEqual([10, 20])
    const result = computeElementQuantities(subset, {
      targetIds: new Set([10]),
      keepPositionsFor: new Set([10]),
    })
    expect(result.elements.map((item) => item.expressId)).toEqual([10])
    almost(result.elements[0].metrics.COVEREDAREA, 0.4 * 3)
    expect(result.elements[0].faces[0].positions.length).toBeGreaterThan(0)
  })
})

describe('whole-model takeoff without storing triangle soups', () => {
  it('keeps numbers and hydrates overlay vertices from live meshes', async () => {
    const column = boxMesh(10, 'IfcColumn', [0, 0, 0], [0.4, 3, 0.4])
    const wall = boxMesh(20, 'IfcWall', [0.4, 0, 0], [0.6, 3, 0.4])
    const full = computeElementQuantities([column, wall], { keepPositions: false })
    expect(full.elements.every((item) => item.faces.every((face) => face.positions.length === 0))).toBe(true)
    const chunked = await runWholeModelQuantities([column, wall], { chunkSize: 1 })
    almost(chunked.netArea, full.netArea)
    almost(chunked.elements[0].metrics.COVEREDAREA, full.elements[0].metrics.COVEREDAREA)
    const hydrated = hydrateFacePositions(chunked.elements[0], [column, wall])
    expect(hydrated.faces.some((face) => face.positions.length > 0)).toBe(true)
  })
})
