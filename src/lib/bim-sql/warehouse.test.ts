import { describe, expect, it } from 'vitest'
import { openBimDatabase, closeBimDatabase } from '@/lib/bim-sql/database'
import { insertElementRecords } from '@/lib/bim-sql/ingest'
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
})
