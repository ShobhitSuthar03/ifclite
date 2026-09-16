import { describe, expect, it } from 'vitest'
import { missingTakeoffIds, resolveTakeoffTarget, xorIds } from '@/lib/takeoff-scope'

describe('takeoff scope', () => {
  it('prefers a filter value over a 3D selection', () => {
    const target = resolveTakeoffTarget({
      specType: 'walls',
      specStorey: null,
      filterPropertyKey: 'property:Pset_WallCommon.IsExternal',
      filterNodeKey: 'true',
      filterIds: [1, 2],
      breakdownRuleKeys: ['attribute:Attributes.IFC Type'],
      breakdownNodeKey: null,
      breakdownIds: null,
      selectedIds: [9],
    })
    expect(target.ids).toEqual([1, 2])
    expect(target.key).toContain('filter')
    expect(target.key).toContain('IsExternal')
  })

  it('changes key when the classified value changes', () => {
    const base = {
      specType: 'all',
      specStorey: null,
      filterPropertyKey: 'property:Pset_WallCommon.IsExternal',
      filterIds: [1],
      breakdownRuleKeys: [],
      breakdownNodeKey: null,
      breakdownIds: null,
      selectedIds: [] as number[],
    }
    const a = resolveTakeoffTarget({ ...base, filterNodeKey: 'true', filterIds: [1] })
    const b = resolveTakeoffTarget({ ...base, filterNodeKey: 'false', filterIds: [2] })
    expect(a.key).not.toBe(b.key)
  })

  it('lists only unmeasured ids', () => {
    expect(missingTakeoffIds([1, 2, 3], [2])).toEqual([1, 3])
    expect(xorIds([1, 2, 3])).toBe(1 ^ 2 ^ 3)
  })
})
