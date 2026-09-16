import { describe, expect, it } from 'vitest'
import { BUILTIN_LENSES, type LensDataProvider } from '@ifc-lite/lens'
import { createPropertyColorLens, evaluateActiveLens } from '@/lib/user-lens'

function mockProvider(): LensDataProvider {
  return {
    getEntityCount: () => 3,
    forEachEntity(callback) {
      callback(1, 'model')
      callback(2, 'model')
      callback(3, 'model')
    },
    getEntityType(id) {
      if (id === 1) return 'IfcWall'
      if (id === 2) return 'IfcSlab'
      return 'IfcDoor'
    },
    getPropertyValue(id, _pset, name) {
      if (name === 'IsExternal') return id === 1
      return undefined
    },
    getPropertySets(id) {
      if (id !== 1) return []
      return [{ name: 'Pset_WallCommon', properties: [{ name: 'IsExternal', value: true }] }]
    },
  }
}

describe('evaluateActiveLens', () => {
  it('auto-colors builtin class lens instead of treating empty rules as a no-op', () => {
    const byClass = BUILTIN_LENSES.find((lens) => lens.id === 'lens-by-class')
    expect(byClass).toBeTruthy()
    const result = evaluateActiveLens(byClass!, mockProvider())
    expect(result.legend.map((entry) => entry.name).sort()).toEqual(['IfcDoor', 'IfcSlab', 'IfcWall'])
    expect(result.colorMap.size).toBe(3)
  })

  it('evaluates a user property rule', () => {
    const lens = createPropertyColorLens({
      propertySet: 'Pset_WallCommon',
      propertyName: 'IsExternal',
      operator: 'equals',
      propertyValue: 'true',
      color: '#E53935',
    })
    const result = evaluateActiveLens(lens, mockProvider())
    expect(result.ruleCounts.get(lens.rules[0].id)).toBe(1)
    expect(result.legend[0]?.count).toBe(1)
  })
})
