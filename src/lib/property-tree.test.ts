import { describe, expect, it } from 'vitest'
import { closeBimDatabase, openBimDatabase } from '@/lib/bim-sql/database'
import { insertElementRecords } from '@/lib/bim-sql/ingest'
import { buildWarehousePropertyTree } from '@/lib/bim-sql/property-tree'
import { ATTRIBUTE_IFC_TYPE, findPropertyNode, nestByValues } from '@/lib/property-tree'
import type { ElementRecord } from '@/lib/bim-sql/types'
import { EMPTY_QUERY } from '@/lib/ifc-query'

function record(partial: Partial<ElementRecord> & { expressId: number }): ElementRecord {
  return {
    globalId: `g-${partial.expressId}`,
    ifcType: 'IfcWall',
    category: 'IfcWall',
    name: `W${partial.expressId}`,
    description: '',
    objectType: '',
    tag: '',
    storeyId: 10,
    storeyName: 'L1',
    zoneName: '',
    material: 'Concrete',
    costCode: 'C-01',
    boqItem: 'C-01',
    phase: 'Structure',
    status: 'Planned',
    volume: 2,
    area: 8,
    length: 4,
    width: 0.2,
    height: 3,
    weight: 4800,
    unitCost: 180,
    totalCost: 360,
    targetCost: 331.2,
    fireRating: 'REI60',
    properties: [],
    quantities: [],
    ...partial,
  }
}

describe('property tree', () => {
  it('nests unique values and keeps exact spellings', () => {
    const type = new Map([
      [1, 'IfcWall'],
      [2, 'IfcWall'],
      [3, 'IfcSlab'],
    ])
    const fire = new Map([
      [1, 'REI60'],
      [2, 'rei60'],
      [3, 'REI60'],
    ])
    const tree = nestByValues([1, 2, 3], [type, fire])
    expect(tree.map((node) => node.label)).toEqual(['IfcSlab', 'IfcWall'])
    const walls = tree.find((node) => node.label === 'IfcWall')
    expect(walls?.children.map((child) => child.label)).toEqual(['REI60', 'rei60'])
    expect(walls?.children.find((child) => child.label === 'rei60')?.ids).toEqual([2])
  })

  it('builds a warehouse value tree and a nested custom breakdown', async () => {
    const db = await openBimDatabase()
    try {
      insertElementRecords(db, 1, [
        record({
          expressId: 1,
          properties: [{ pset: 'Pset_WallCommon', name: 'IsExternal', value: 'true', numeric: 1 }],
        }),
        record({
          expressId: 2,
          properties: [{ pset: 'Pset_WallCommon', name: 'IsExternal', value: 'True', numeric: 1 }],
        }),
        record({
          expressId: 3,
          ifcType: 'IfcSlab',
          category: 'IfcSlab',
          properties: [{ pset: 'Pset_SlabCommon', name: 'IsExternal', value: 'true', numeric: 1 }],
        }),
      ])

      const values = buildWarehousePropertyTree(
        db,
        [{ set: 'Pset_WallCommon', name: 'IsExternal', kind: 'property' }],
        EMPTY_QUERY,
      )
      expect(values.map((node) => node.label).sort()).toEqual(['True', 'true', '—'])
      expect(findPropertyNode(values, 'true')?.ids).toEqual([1])
      expect(findPropertyNode(values, 'True')?.ids).toEqual([2])
      expect(findPropertyNode(values, '—')?.ids).toEqual([3])

      const nested = buildWarehousePropertyTree(
        db,
        [ATTRIBUTE_IFC_TYPE, { set: 'Pset_WallCommon', name: 'IsExternal', kind: 'property' }],
        EMPTY_QUERY,
      )
      const walls = nested.find((node) => node.label === 'IfcWall')
      expect(walls?.count).toBe(2)
      expect(walls?.children.map((child) => child.label).sort()).toEqual(['True', 'true'])
    } finally {
      closeBimDatabase(db)
    }
  })
})
