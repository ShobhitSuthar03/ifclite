import { describe, expect, it } from 'vitest'
import { closeBimDatabase, openBimDatabase } from '@/lib/bim-sql/database'
import { insertElementRecords } from '@/lib/bim-sql/ingest'
import { buildWarehousePropertyTree } from '@/lib/bim-sql/property-tree'
import {
  ATTRIBUTE_IFC_TYPE,
  ATTRIBUTE_STOREY,
  addFilterRule,
  filterRulesNeedParse,
  findPropertyNode,
  moveFilterRule,
  nestByValues,
  parsePropertyRefs,
  promoteFilterRule,
  propertySelectionLabel,
  removeFilterRule,
  toggleFilterKeys,
  unionPropertyNodeIds,
} from '@/lib/property-tree'
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
  it('adds a second property to a saved breakdown instead of replacing it', () => {
    const first = addFilterRule([], ATTRIBUTE_IFC_TYPE)
    const nested = addFilterRule(first, ATTRIBUTE_STOREY)
    expect(nested).toEqual([ATTRIBUTE_IFC_TYPE, ATTRIBUTE_STOREY])
    expect(addFilterRule(nested, ATTRIBUTE_STOREY)).toEqual(nested)
    expect(removeFilterRule(nested, ATTRIBUTE_IFC_TYPE)).toEqual([ATTRIBUTE_STOREY])
    expect(moveFilterRule(nested, 0, 1)).toEqual([ATTRIBUTE_STOREY, ATTRIBUTE_IFC_TYPE])
    expect(promoteFilterRule(nested, ATTRIBUTE_STOREY)).toEqual([ATTRIBUTE_STOREY, ATTRIBUTE_IFC_TYPE])
    expect(promoteFilterRule(nested, ATTRIBUTE_IFC_TYPE)).toEqual(nested)
    expect(filterRulesNeedParse(first)).toBe(false)
    expect(filterRulesNeedParse(nested)).toBe(true)
    expect(parsePropertyRefs([{ set: 'Pset', name: 'Level', kind: 'property' }, { name: 'bad' }])).toEqual([
      { set: 'Pset', name: 'Level', kind: 'property' },
    ])
  })

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
    expect(findPropertyNode(tree, walls?.children[0]?.key ?? null)?.label).toBe('REI60')
    expect(toggleFilterKeys(['a'], 'b', false)).toEqual(['b'])
    expect(toggleFilterKeys(['a'], 'b', true)).toEqual(['a', 'b'])
    expect(toggleFilterKeys(['a', 'b'], 'a', true)).toEqual(['b'])
    expect(unionPropertyNodeIds(tree, [walls?.key ?? '', tree[0]!.key]).sort((a, b) => a - b)).toEqual([1, 2, 3])
    expect(propertySelectionLabel(tree, [tree[0]!.key, walls!.key], 'IFC Type')).toBe('IFC Type: IfcSlab + IfcWall')
    const swapped = nestByValues([1, 2, 3], [fire, type])
    expect(swapped.map((node) => node.label)).toEqual(['REI60', 'rei60'])
    expect(swapped.find((node) => node.label === 'REI60')?.children.map((child) => child.label)).toEqual([
      'IfcSlab',
      'IfcWall',
    ])
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
