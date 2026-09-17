import { describe, expect, it } from 'vitest'
import { applyClickSelection, isAdditiveModifier, setsEqual, touchedSelectionIds } from '@/lib/selection'

describe('isAdditiveModifier', () => {
  it('is true for ctrl, meta, or shift', () => {
    expect(isAdditiveModifier({ ctrlKey: true, metaKey: false, shiftKey: false })).toBe(true)
    expect(isAdditiveModifier({ ctrlKey: false, metaKey: true, shiftKey: false })).toBe(true)
    expect(isAdditiveModifier({ ctrlKey: false, metaKey: false, shiftKey: true })).toBe(true)
    expect(isAdditiveModifier({ ctrlKey: false, metaKey: false, shiftKey: false })).toBe(false)
  })
})

describe('applyClickSelection', () => {
  it('replaces on a normal click', () => {
    expect([...applyClickSelection(new Set([1, 2]), 3, false)]).toEqual([3])
  })

  it('toggles on an additive click', () => {
    const added = applyClickSelection(new Set([1]), 2, true)
    expect(added.has(1) && added.has(2)).toBe(true)
    const removed = applyClickSelection(added, 1, true)
    expect([...removed]).toEqual([2])
  })

  it('keeps the set when additive-clicking empty space', () => {
    const current = new Set([1, 2])
    expect(setsEqual(applyClickSelection(current, null, true), current)).toBe(true)
  })
})

describe('touchedSelectionIds', () => {
  it('returns only ids that appeared or disappeared', () => {
    expect(touchedSelectionIds(new Set([1, 2]), new Set([2, 3])).sort()).toEqual([1, 3])
  })

  it('is empty when the sets match', () => {
    expect(touchedSelectionIds(new Set([4, 5]), new Set([5, 4]))).toEqual([])
  })
})
