import { describe, expect, it } from 'vitest'
import { ghostExpressIds, nextHiddenSet, visibleExpressIds } from '@/lib/view-visibility'

describe('view visibility', () => {
  const all = [1, 2, 3, 4]

  it('hides selected ids', () => {
    const hidden = nextHiddenSet(new Set(), 2)
    const visible = visibleExpressIds(all, null, null, hidden)
    expect([...visible].sort((a, b) => a - b)).toEqual([1, 3, 4])
  })

  it('isolate keeps only the focus set', () => {
    const visible = visibleExpressIds(all, null, new Set([2]), new Set())
    expect([...visible]).toEqual([2])
  })

  it('ghosts everything except the focus', () => {
    const ghost = ghostExpressIds('ghost', new Set([2]), all, null, new Set())
    expect([...ghost].sort((a, b) => a - b)).toEqual([1, 3, 4])
  })
})
