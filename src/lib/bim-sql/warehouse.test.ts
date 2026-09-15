import { describe, expect, it } from 'vitest'
import { openBimDatabase, closeBimDatabase, run } from '@/lib/bim-sql/database'
import { insertElementRecords } from '@/lib/bim-sql/ingest'
import { spatialTreeFromWarehouse, entityDataFromWarehouse } from '@/lib/bim-sql/restore'
import { loadFilterOptions, queryElementIds, runReport } from '@/lib/bim-sql/queries'
import { reportToCsv } from '@/lib/bim-sql/export'
import type { ElementRecord } from '@/lib/bim-sql/types'

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

describe('bim sql warehouse', () => {
  it('aggregates QTO with CTE grouping and scope filter', async () => {
    const db = await openBimDatabase()
    try {
      insertElementRecords(db, 1, [
        record({ expressId: 1, volume: 2, area: 8, totalCost: 360 }),
        record({
          expressId: 2,
          category: 'IfcSlab',
          ifcType: 'IfcSlab',
          storeyName: 'L2',
          costCode: 'Unassigned',
          fireRating: '',
          volume: 10,
          area: 40,
          totalCost: 1650,
          status: 'Complete',
        }),
      ])
      const all = runReport(db, 'qto', {
        storey: null,
        category: null,
        costCode: null,
        phase: null,
        status: null,
      }, 'category', [], null)
      expect(all.elementCount).toBe(2)
      expect(all.rows.find((row) => row.key === 'IfcWall')?.values.volume).toBe(2)
      expect(all.rows.find((row) => row.key === 'IfcSlab')?.values.volume).toBe(10)

      const scoped = runReport(
        db,
        'qto',
        { storey: null, category: null, costCode: null, phase: null, status: null },
        'category',
        [],
        new Set([1]),
      )
      expect(scoped.elementCount).toBe(1)
      expect(scoped.rows).toHaveLength(1)

      const qa = runReport(
        db,
        'qa',
        { storey: null, category: null, costCode: null, phase: null, status: null },
        'category',
        [],
        null,
      )
      expect(qa.rows.find((row) => row.key === 'cost')?.values.count).toBe(1)
      expect(qa.rows.find((row) => row.key === 'fire')?.values.count).toBe(1)

      const ids = queryElementIds(
        db,
        { storey: null, category: null, costCode: null, phase: null, status: null },
        'category',
        'IfcWall',
      )
      expect(ids).toEqual([1])

      const csv = reportToCsv(all)
      expect(csv).toContain('Total')
      expect(csv.split('\n').length).toBeGreaterThan(2)

      const options = loadFilterOptions(db)
      expect(options.storeys).toEqual(['L1', 'L2'])
    } finally {
      closeBimDatabase(db)
    }
  })

  it('rebuilds the spatial tree and properties from the saved warehouse', async () => {
    const db = await openBimDatabase()
    try {
      run(db, `INSERT INTO models (name, version_id, loaded_at) VALUES ('a.ifc', 'abc', 'now')`)
      run(
        db,
        `INSERT INTO spatial_locations (model_id, express_id, name, type, elevation, parent_express_id)
         VALUES (1, 1, 'Project', 'IfcProject', NULL, NULL)`,
      )
      run(
        db,
        `INSERT INTO spatial_locations (model_id, express_id, name, type, elevation, parent_express_id)
         VALUES (1, 10, 'L1', 'IfcBuildingStorey', 0, 1)`,
      )
      insertElementRecords(db, 1, [
        record({
          expressId: 21,
          name: 'Wall A',
          storeyId: 10,
          properties: [{ pset: 'Pset_Wall', name: 'IsExternal', value: 'true', numeric: 1 }],
          quantities: [{ qset: 'Qto_Wall', name: 'NetVolume', value: 2.5, unit: 'm3' }],
        }),
      ])
      const tree = spatialTreeFromWarehouse(db)
      expect(tree?.name).toBe('Project')
      expect(tree?.children[0]?.name).toBe('L1')
      expect(tree?.children[0]?.elementGroups[0]?.ids).toEqual([21])
      const entity = entityDataFromWarehouse(db, 21, 'IfcWall')
      expect(entity.name).toBe('Wall A')
      expect(entity.propertySets[0]?.properties[0]?.name).toBe('IsExternal')
      expect(entity.quantitySets[0]?.quantities[0]?.name).toBe('NetVolume')
    } finally {
      closeBimDatabase(db)
    }
  })
})
