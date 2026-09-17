import { describe, expect, it } from 'vitest'
import { elementDisplayName, friendlyIfcType } from '@/lib/element-label'

describe('friendlyIfcType', () => {
  it('strips the Ifc prefix', () => {
    expect(friendlyIfcType('IfcPile')).toBe('Pile')
  })

  it('falls back when the type is missing', () => {
    expect(friendlyIfcType('')).toBe('Element')
  })
})

describe('elementDisplayName', () => {
  it('prefers Name, then Tag, then ObjectType, then the IFC type', () => {
    expect(elementDisplayName({ name: 'P1', tag: 'T', objectType: 'OT', typeName: 'IfcPile' })).toBe('P1')
    expect(elementDisplayName({ name: '', tag: 'HP-12', objectType: 'OT', typeName: 'IfcPile' })).toBe('HP-12')
    expect(elementDisplayName({ name: '  ', tag: '', objectType: 'Prefab pile', typeName: 'IfcPile' })).toBe(
      'Prefab pile',
    )
    expect(elementDisplayName({ typeName: 'IfcPile' })).toBe('Pile')
  })
})
