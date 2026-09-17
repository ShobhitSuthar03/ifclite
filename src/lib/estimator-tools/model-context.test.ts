import { describe, expect, it } from 'vitest'
import { IfcTypeEnum } from '@/lib/ifc-data'
import { summarizeModelForAgent } from '@/lib/estimator-tools/model-context'

describe('summarizeModelForAgent', () => {
  it('reports no model loaded', () => {
    expect(summarizeModelForAgent('tower.ifc', null)).toBe('Model: not loaded.')
  })

  it('aggregates element type counts and storeys across the whole tree', () => {
    const root = {
      expressId: 1,
      name: 'Site',
      type: IfcTypeEnum.IfcSite,
      children: [
        {
          expressId: 2,
          name: 'Level 1',
          type: IfcTypeEnum.IfcBuildingStorey,
          children: [],
          elementGroups: [
            { typeName: 'IfcWall', ids: [10, 11, 12] },
            { typeName: 'IfcSlab', ids: [13] },
          ],
          totalElements: 4,
        },
        {
          expressId: 3,
          name: 'Level 2',
          type: IfcTypeEnum.IfcBuildingStorey,
          children: [],
          elementGroups: [{ typeName: 'IfcWall', ids: [20] }],
          totalElements: 1,
        },
      ],
      elementGroups: [],
      totalElements: 5,
    }
    const summary = summarizeModelForAgent('tower.ifc', root)
    expect(summary).toContain('tower.ifc — 5 elements across 2 IFC types.')
    expect(summary).toContain('IfcWall (4)')
    expect(summary).toContain('IfcSlab (1)')
    expect(summary).toContain('2 storeys: Level 1, Level 2')
  })

  it('caps the type list and notes how many more exist', () => {
    const elementGroups = Array.from({ length: 14 }, (_, i) => ({
      typeName: `IfcType${i}`,
      ids: [i],
    }))
    const root = {
      expressId: 1,
      name: 'Project',
      type: IfcTypeEnum.IfcProject,
      children: [],
      elementGroups,
      totalElements: 14,
    }
    const summary = summarizeModelForAgent(null, root)
    expect(summary).toContain('+2 more types')
    expect(summary).toContain('no storeys found in spatial tree')
  })
})
