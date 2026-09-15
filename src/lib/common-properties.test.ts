import { describe, expect, it } from 'vitest'
import { commonProperties, selectionTypeLabel } from '@/lib/common-properties'
import type { EntityData } from '@/lib/ifc-data'

function entity(partial: Partial<EntityData> & { expressId: number }): EntityData {
  return {
    ifcType: 'IfcWall',
    globalId: '',
    name: '',
    description: '',
    objectType: '',
    tag: '',
    propertySets: [],
    quantitySets: [],
    ...partial,
  }
}

describe('commonProperties', () => {
  it('sums shared numeric quantities and flags mixed text', () => {
    const rows = commonProperties([
      entity({
        expressId: 1,
        name: 'A',
        quantitySets: [{ name: 'Qto_WallBaseQuantities', quantities: [{ name: 'Length', value: '4.000' }] }],
        propertySets: [{ name: 'Pset_WallCommon', properties: [{ name: 'IsExternal', value: 'Yes' }] }],
      }),
      entity({
        expressId: 2,
        name: 'B',
        quantitySets: [{ name: 'Qto_WallBaseQuantities', quantities: [{ name: 'Length', value: '6.000' }] }],
        propertySets: [{ name: 'Pset_WallCommon', properties: [{ name: 'IsExternal', value: 'No' }] }],
      }),
    ])
    expect(selectionTypeLabel([entity({ expressId: 1 }), entity({ expressId: 2 })])).toBe('IfcWall')
    expect(rows.find((row) => row.name === 'Name')).toMatchObject({ value: 'mixed', mixed: true, summed: false })
    expect(rows.find((row) => row.name === 'Length')).toMatchObject({ value: '10.000', summed: true })
    expect(rows.find((row) => row.name === 'IsExternal')?.mixed).toBe(true)
    const wallsNamed = commonProperties([
      entity({ expressId: 1, name: 'Wall1' }),
      entity({ expressId: 2, name: 'Wall2' }),
    ])
    expect(wallsNamed.find((row) => row.name === 'Name')).toMatchObject({ mixed: true, summed: false })
  })
})
