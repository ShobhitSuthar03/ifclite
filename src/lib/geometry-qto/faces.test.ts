import { describe, expect, it } from 'vitest'
import { extractFaces } from '@/lib/geometry-qto/faces'
import type { QtoMesh } from '@/lib/geometry-qto/types'

function mesh(expressId: number, positions: number[], indices: number[]): QtoMesh {
  return { expressId, ifcType: 'IfcRoof', positions, indices }
}

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
