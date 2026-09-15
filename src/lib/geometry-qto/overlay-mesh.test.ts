import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { addQuantityFaceOverlay, faceMatchesLayer, faceMatchesLayers, toggleFaceLayer } from '@/lib/geometry-qto/overlay-mesh'
import type { FaceQuantity } from '@/lib/geometry-qto'

function face(kind: FaceQuantity['kind'], overlap = 0): FaceQuantity {
  return {
    faceId: '1:0',
    expressId: 1,
    ifcType: 'IfcWall',
    kind,
    normal: [1, 0, 0],
    grossArea: 2,
    overlapArea: overlap,
    netArea: 2 - overlap,
    overlappingIds: overlap ? [9] : [],
    positions: [],
  }
}

describe('addQuantityFaceOverlay', () => {
  it('keeps overlay colors view-stable (unlit, both sides, opaque)', () => {
    const group = new THREE.Group()
    addQuantityFaceOverlay(
      group,
      {
        ...face('lateral'),
        positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
      },
      'all',
    )
    const mesh = group.children[0] as THREE.Mesh
    const material = mesh.material as THREE.MeshBasicMaterial
    expect(material).toBeInstanceOf(THREE.MeshBasicMaterial)
    expect(material.side).toBe(THREE.DoubleSide)
    expect(material.depthWrite).toBe(true)
    expect(material.toneMapped).toBe(false)
    expect(material.transparent).toBe(false)
  })
})

describe('toggleFaceLayer', () => {
  it('lets several surface types stay on, and All faces clears them', () => {
    const lateral = toggleFaceLayer(new Set(['all']), 'lateral')
    expect([...lateral]).toEqual(['lateral'])
    const both = toggleFaceLayer(lateral, 'top')
    expect(both.has('lateral') && both.has('top')).toBe(true)
    expect(toggleFaceLayer(both, 'all')).toEqual(new Set(['all']))
    expect(toggleFaceLayer(new Set(['top']), 'top')).toEqual(new Set(['all']))
  })
})

describe('faceMatchesLayers', () => {
  it('unions selected layers', () => {
    expect(faceMatchesLayers(face('top'), new Set(['top', 'bottom']))).toBe(true)
    expect(faceMatchesLayers(face('lateral'), new Set(['top', 'bottom']))).toBe(false)
    expect(faceMatchesLayers(face('top'), new Set(['all']))).toBe(true)
  })
})

describe('faceMatchesLayer', () => {
  it('filters legend layers', () => {
    expect(faceMatchesLayer(face('top'), 'top')).toBe(true)
    expect(faceMatchesLayer(face('top'), 'lateral')).toBe(false)
    expect(faceMatchesLayer(face('lateral', 1), 'contact')).toBe(true)
    expect(faceMatchesLayer(face('lateral'), 'all')).toBe(true)
  })
})
