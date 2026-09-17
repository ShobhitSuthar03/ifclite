import { describe, expect, it } from 'vitest'
import { closeBimDatabase, openBimDatabase } from '@/lib/bim-sql/database'
import { insertElementRecords } from '@/lib/bim-sql/ingest'
import { groupingCatalog, propertyCatalogFromWarehouse, queryWarehouse } from '@/lib/bim-sql/catalog'
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

describe('warehouse property filters', () => {
  it('finds walls by Pset property and lists the catalog', async () => {
    const db = await openBimDatabase()
    try {
      insertElementRecords(db, 1, [
        record({
          expressId: 1,
          properties: [{ pset: 'Pset_WallCommon', name: 'IsExternal', value: 'true', numeric: 1 }],
        }),
        record({
          expressId: 2,
          properties: [{ pset: 'Pset_WallCommon', name: 'IsExternal', value: 'false', numeric: 0 }],
        }),
        record({
          expressId: 3,
          ifcType: 'IfcSlab',
          category: 'IfcSlab',
          properties: [{ pset: 'Pset_SlabCommon', name: 'IsExternal', value: 'true', numeric: 1 }],
        }),
      ])
      const catalog = propertyCatalogFromWarehouse(db)
      expect(catalog.some((item) => item.set === 'Pset_WallCommon' && item.names.includes('IsExternal'))).toBe(true)

      const walls = queryWarehouse(db, { ...EMPTY_QUERY, typeScope: 'walls' })
      expect(walls.map((row) => row.expressId).sort()).toEqual([1, 2])

      const external = queryWarehouse(db, {
        typeScope: 'walls',
        storeyId: null,
        clauses: [{ id: 'ext', pset: 'Pset_WallCommon', name: 'IsExternal', op: '=', value: 'true' }],
      })
      expect(external.map((row) => row.expressId)).toEqual([1])

      const byPropertyOnly = queryWarehouse(db, {
        typeScope: 'all',
        storeyId: null,
        clauses: [{ id: 'ext', pset: 'Pset_WallCommon', name: 'IsExternal', op: '=', value: 'true' }],
      })
      expect(byPropertyOnly.map((row) => row.expressId)).toEqual([1])

      const slabs = queryWarehouse(db, {
        typeScope: 'all',
        storeyId: null,
        clauses: [{ id: 'ext', pset: 'Pset_SlabCommon', name: 'IsExternal', op: '=', value: 'true' }],
      })
      expect(slabs.map((row) => row.expressId)).toEqual([3])
    } finally {
      closeBimDatabase(db)
    }
  })
})

describe('groupingCatalog', () => {
  const catalog = [
    { set: 'Pset_WallCommon', names: ['IsExternal', 'LoadBearing'], kind: 'property' as const },
    { set: 'Qto_WallBaseQuantities', names: ['NetVolume', 'NetSideArea'], kind: 'quantity' as const },
  ]

  it('always includes attribute fields and filters by property name or set', () => {
    const all = groupingCatalog(catalog)
    expect(all[0]?.set).toBe('Attributes')
    expect(all[0]?.names).toEqual(expect.arrayContaining(['IFC Type', 'Storey']))

    const byName = groupingCatalog(catalog, 'storey')
    expect(byName).toEqual([{ set: 'Attributes', names: ['Storey'], kind: 'attribute' }])

    const bySet = groupingCatalog(catalog, 'qto_wall')
    expect(bySet).toEqual([
      { set: 'Qto_WallBaseQuantities', names: ['NetVolume', 'NetSideArea'], kind: 'quantity' },
    ])

    expect(groupingCatalog(catalog, 'nope')).toEqual([])
  })
})
