import { describe, expect, it } from 'vitest'
import { overlayFromPatches, overlayLabel } from '@/lib/mutation-overlay'

describe('mutation overlay', () => {
  it('looks up edited attributes and properties by element', () => {
    const overlay = overlayFromPatches([
      { expressId: 10, kind: 'attribute', name: 'Name', value: 'Wall B' },
      { expressId: 10, kind: 'property', pset: 'Pset_WallCommon', name: 'FireRating', value: 'REI90' },
      { expressId: 11, kind: 'attribute', name: 'Name', value: 'Slab A' },
    ])
    expect(
      overlayLabel(overlay, { set: 'Attributes', name: 'Name', kind: 'attribute' }, 10),
    ).toBe('Wall B')
    expect(
      overlayLabel(overlay, { set: 'Pset_WallCommon', name: 'FireRating', kind: 'property' }, 10),
    ).toBe('REI90')
    expect(
      overlayLabel(overlay, { set: 'Attributes', name: 'Name', kind: 'attribute' }, 11),
    ).toBe('Slab A')
    expect(
      overlayLabel(overlay, { set: 'Attributes', name: 'Name', kind: 'attribute' }, 12),
    ).toBeUndefined()
  })
})
