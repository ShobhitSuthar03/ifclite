import { describe, expect, it } from 'vitest'
import { elementVolume, extractFaces } from '@/lib/geometry-qto/faces'
import type { QtoMesh } from '@/lib/geometry-qto/types'

function mesh(expressId: number, positions: number[], indices: number[]): QtoMesh {
  return { expressId, ifcType: 'IfcRoof', positions, indices }
}

// Unit box corners P0-P7 (P0=min corner, P6=max corner), used below both intact
// and with one face re-triangulated to reproduce a real-world malformed brep.
const boxPositions = [
  0, 0, 0, // P0
  1, 0, 0, // P1
  1, 0, 1, // P2
  0, 0, 1, // P3
  0, 1, 0, // P4
  1, 1, 0, // P5
  1, 1, 1, // P6
  0, 1, 1, // P7
]
// Every face except +X (P1,P2,P5,P6), triangulated normally.
const boxFacesExceptPlusX = [
  0, 1, 2, 0, 2, 3, // -Y
  4, 6, 5, 4, 7, 6, // +Y
  0, 3, 7, 0, 7, 4, // -X
  0, 4, 5, 0, 5, 1, // -Z
  3, 2, 6, 3, 6, 7, // +Z
]

describe('extractFaces coplanar merging', () => {
  it('merges a flat quad split into two triangles, even when one vertex has ~1mm noise', () => {
    // A 2x2 flat quad in the XZ plane (y=0), split along the diagonal. The
    // second triangle's shared-edge vertex is nudged by 1mm in Y - the kind of
    // tessellation noise that used to land in a different quantized plane
    // bucket and split what is visually one continuous roof face in two.
    const positions = [
      0, 0, 0, // 0
      2, 0, 0, // 1
      2, 0, 2, // 2
      0, 0.001, 2, // 3 (noisy)
    ]
    const indices = [0, 1, 2, 0, 2, 3]
    const faces = extractFaces([mesh(1, positions, indices)])
    expect(faces).toHaveLength(1)
    expect(faces[0].triangles).toHaveLength(2)
  })

  it('does not merge two triangles across a real 90° fold', () => {
    // Two unit triangles sharing edge (1,0,0)-(1,0,1): one flat in XZ (normal
    // ~+Y), the other standing up in the XY plane (normal ~+Z or -Z) - a
    // wall/roof corner, not tessellation noise.
    const positions = [
      0, 0, 0, // 0
      1, 0, 0, // 1
      1, 0, 1, // 2
      1, 1, 1, // 3
    ]
    const indices = [0, 1, 2, 1, 3, 2]
    const faces = extractFaces([mesh(1, positions, indices)])
    expect(faces).toHaveLength(2)
    expect(faces.every((face) => face.triangles.length === 1)).toBe(true)
  })
})

describe('elementVolume', () => {
  it('trusts the mesh volume for a properly closed box', () => {
    const plusX = [1, 5, 6, 1, 6, 2]
    const box = mesh(1, boxPositions, [...boxFacesExceptPlusX, ...plusX])
    const result = elementVolume([box])
    expect(result.source).toBe('mesh')
    expect(result.volume).toBeCloseTo(1, 6)
  })

  it('falls back to OBB volume when a face is double-triangulated across both diagonals', () => {
    // Real IFC exports have shown up with one end of a brep re-triangulated
    // using BOTH diagonals of a quad (4 triangles covering every 3-of-4 vertex
    // combination instead of 2), producing a flat, ill-defined "degenerate
    // tetrahedron" patch. It's still a technically closed 2-manifold - every
    // edge is used exactly twice - so it isn't caught by a manifold/edge-count
    // check, but the divergence-theorem sum comes out far from the true volume.
    const [a, b, c, d] = [1, 2, 5, 6] // +X face corners
    const brokenPlusX = [b, a, c, b, c, d, a, c, d, a, d, b]
    const box = mesh(1, boxPositions, [...boxFacesExceptPlusX, ...brokenPlusX])

    const result = elementVolume([box])
    expect(result.source).toBe('obb')
    expect(result.volume).toBeCloseTo(1, 6) // true box volume, recovered via OBB
  })
})
