import { describe, expect, it } from 'vitest'
import { openBimDatabase, closeBimDatabase, run, all } from '@/lib/bim-sql/database'
import { insertElementRecords, isWarehouseElementType } from '@/lib/bim-sql/ingest'
import { FederationRegistry } from '@/lib/federation'
import { spatialTreeFromWarehouse, entityDataFromWarehouse } from '@/lib/bim-sql/restore'
import { applyScope, loadFilterOptions, queryElementIds, runReport } from '@/lib/bim-sql/queries'
import { applyMutationPatchToWarehouse, applyMutationPatchesToWarehouse } from '@/lib/bim-sql/mutate'
import { reportToCsv } from '@/lib/bim-sql/export'
import { EMPTY_REPORT_FILTER, type ElementRecord } from '@/lib/bim-sql/types'
import { buildWarehousePropertyTree } from '@/lib/bim-sql/property-tree'
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

  it('writes property edits into warehouse rows used by reports and filters', async () => {
    const db = await openBimDatabase()
    try {
      insertElementRecords(db, 1, [
        record({
          expressId: 1,
          name: 'Wall A',
          costCode: 'C-01',
          status: 'Planned',
          properties: [
            { pset: 'Pset_WallCommon', name: 'FireRating', value: 'REI60', numeric: null },
            { pset: 'Pset_Cost', name: 'CostCode', value: 'C-01', numeric: null },
          ],
        }),
      ])
      applyMutationPatchesToWarehouse(db, [
        { expressId: 1, kind: 'attribute', name: 'Name', value: 'Wall B' },
        { expressId: 1, kind: 'property', pset: 'Pset_Cost', name: 'CostCode', value: 'C-99' },
        { expressId: 1, kind: 'property', pset: 'Pset_WallCommon', name: 'FireRating', value: 'REI120' },
        { expressId: 1, kind: 'property', pset: 'Pset_WallCommon', name: 'IsExternal', value: 'true' },
      ])
      const row = all<{ name: string; cost_code: string; fire_rating: string }>(
        db,
        'SELECT name, cost_code, fire_rating FROM elements WHERE express_id = 1',
      )[0]
      expect(row.name).toBe('Wall B')
      expect(row.cost_code).toBe('C-99')
      expect(row.fire_rating).toBe('REI120')
      const inserted = all<{ value: string }>(
        db,
        `SELECT value FROM element_properties WHERE express_id = 1 AND pset = 'Pset_WallCommon' AND name = 'IsExternal'`,
      )[0]
      expect(inserted.value).toBe('true')

      const cost = runReport(db, 'cost', EMPTY_REPORT_FILTER, 'cost_code', [], null)
      expect(cost.rows.find((item) => item.key === 'C-99')?.values.count).toBe(1)
      expect(cost.rows.find((item) => item.key === 'C-01')).toBeUndefined()

      const names = buildWarehousePropertyTree(
        db,
        [{ set: 'Attributes', name: 'Name', kind: 'attribute' }],
        EMPTY_QUERY,
      )
      expect(names.map((node) => node.label)).toEqual(['Wall B'])
    } finally {
      closeBimDatabase(db)
    }
  })

  it('skips patches for elements that are not in the warehouse', async () => {
    const db = await openBimDatabase()
    try {
      expect(
        applyMutationPatchToWarehouse(db, { expressId: 99, kind: 'attribute', name: 'Name', value: 'Ghost' }),
      ).toBe(false)
    } finally {
      closeBimDatabase(db)
    }
  })

  it('does not collide when two models reuse the same local expressIds (federation)', async () => {
    const db = await openBimDatabase()
    try {
      // Two "files" that both happen to number their first two elements 1 and 2 -
      // exactly the case that used to hit elements.express_id's UNIQUE constraint.
      const registry = new FederationRegistry()
      registry.registerModel('a', 'a.ifc', 2)
      registry.registerModel('b', 'b.ifc', 2)
      const globalize = (modelId: string, rows: ReturnType<typeof record>[]) =>
        rows.map((row) => ({ ...row, expressId: registry.toGlobalId(modelId, row.expressId) }))

      insertElementRecords(
        db,
        1,
        globalize('a', [record({ expressId: 1, name: 'A1' }), record({ expressId: 2, name: 'A2' })]),
      )
      insertElementRecords(
        db,
        2,
        globalize('b', [record({ expressId: 1, name: 'B1' }), record({ expressId: 2, name: 'B2' })]),
      )

      const rows = all<{ name: string }>(db, 'SELECT name FROM elements ORDER BY name')
      expect(rows.map((row) => row.name)).toEqual(['A1', 'A2', 'B1', 'B2'])

      applyScope(db, null)
      const ids = queryElementIds(
        db,
        { storey: null, category: null, costCode: null, phase: null, status: null },
        'category',
        'IfcWall',
      )
      expect(ids).toHaveLength(4)
      expect(new Set(ids).size).toBe(4) // every global id is distinct
    } finally {
      closeBimDatabase(db)
    }
  })

  it('counts model products, not tessellation primitives', () => {
    expect(isWarehouseElementType('IfcWall')).toBe(true)
    expect(isWarehouseElementType('IfcSlab')).toBe(true)
    expect(isWarehouseElementType('IfcBuildingElementProxy')).toBe(true)
    expect(isWarehouseElementType('IfcIndexedPolygonalFace')).toBe(false)
    expect(isWarehouseElementType('IfcTriangulatedFaceSet')).toBe(false)
    expect(isWarehouseElementType('IfcExtrudedAreaSolid')).toBe(false)
    expect(isWarehouseElementType('IfcCartesianPoint')).toBe(false)
    expect(isWarehouseElementType('IfcMappedItem')).toBe(false)
  })
})
