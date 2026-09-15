import { describe, expect, it } from 'vitest'
import { resolveCsvKeepIds } from '@/lib/csv-export'

describe('resolveCsvKeepIds', () => {
  it('keeps the full selection set for selected scope', () => {
    const keep = resolveCsvKeepIds('selected', null, new Set([9]), new Set([1, 2, 3]))
    expect(keep).toEqual(new Set([1, 2, 3]))
  })

  it('returns an empty set when nothing is selected', () => {
    expect(resolveCsvKeepIds('selected', null, new Set(), new Set())).toEqual(new Set())
  })
})
