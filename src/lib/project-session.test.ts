import { describe, expect, it } from 'vitest'
import { persistableQuantities, parseSessionJson, emptySession } from '@/lib/project-session'
import type { QuantityResult } from '@/lib/geometry-qto'

describe('project session', () => {
  it('strips overlay triangle buffers from quantities', () => {
    const result: QuantityResult = {
      elements: [
        {
          expressId: 12,
          ifcType: 'IfcWall',
          faces: [
            {
              faceId: 'a',
              expressId: 12,
              ifcType: 'IfcWall',
              kind: 'lateral',
              normal: [1, 0, 0],
              grossArea: 2,
              overlapArea: 0,
              netArea: 2,
              overlappingIds: [],
              positions: [0, 0, 0, 1, 0, 0, 1, 1, 0],
            },
          ],
          metrics: {
            AREAMAX: 2,
            AREAMIN: 1,
            LATERALAREA: 2,
            UNDERAREA: 0,
            TOPAREA: 0,
            GROSSAREA: 2,
            COVEREDAREA: 0,
            UNCOVEREDAREA: 2,
            CROSSAREA: 1,
            FOOTPRINTAREA: 1,
            VOLUME: 1,
            LENGTH: 1,
            WIDTH: 1,
            HEIGHT: 1,
            COUNT: 1,
          },
          grossArea: 2,
          overlapArea: 0,
          netArea: 2,
        },
      ],
      elementCount: 1,
      columnCount: 0,
      totals: {
        LATERALAREA: 2,
        UNDERAREA: 0,
        TOPAREA: 0,
        GROSSAREA: 2,
        COVEREDAREA: 0,
        UNCOVEREDAREA: 2,
        VOLUME: 1,
        LENGTH: 1,
        WIDTH: 1,
        HEIGHT: 1,
        COUNT: 1,
      },
      grossArea: 2,
      overlapArea: 0,
      netArea: 2,
    }
    const saved = persistableQuantities(result)
    expect(saved?.elements[0]?.faces).toEqual([])
    expect(saved?.elements[0]?.metrics.LATERALAREA).toBe(2)
  })

  it('rejects sessions that are not version 1', () => {
    expect(parseSessionJson('{"version":2}')).toBeNull()
    expect(parseSessionJson(JSON.stringify(emptySession('abc', 'a.ifc')))?.cacheKey).toBe('abc')
    expect(parseSessionJson(JSON.stringify(emptySession('abc', 'a.ifc')))?.filterRules).toEqual([])
    const legacy = JSON.parse(JSON.stringify(emptySession('abc', 'a.ifc'))) as { filterRules?: unknown }
    delete legacy.filterRules
    expect(parseSessionJson(JSON.stringify(legacy))?.filterRules).toEqual([])
    const withRules = emptySession('abc', 'a.ifc')
    withRules.filterRules = [{ set: 'Pset', name: 'Level', kind: 'property' }]
    expect(parseSessionJson(JSON.stringify(withRules))?.filterRules).toEqual([
      { set: 'Pset', name: 'Level', kind: 'property' },
    ])
    const withViews = emptySession('abc', 'a.ifc')
    withViews.savedViews = [{ id: 'view-1', name: 'Walls', ids: [2, 1], createdAt: 'now' }]
    expect(parseSessionJson(JSON.stringify(withViews))?.savedViews).toEqual([
      { id: 'view-1', name: 'Walls', ids: [1, 2], createdAt: 'now' },
    ])
    const legacyViews = JSON.parse(JSON.stringify(emptySession('abc', 'a.ifc'))) as { savedViews?: unknown }
    delete legacyViews.savedViews
    expect(parseSessionJson(JSON.stringify(legacyViews))?.savedViews).toEqual([])
    const withEstimation = JSON.parse(JSON.stringify(emptySession('abc', 'a.ifc'))) as { estimation?: unknown }
    withEstimation.estimation = {
      name: 'Tower A',
      groupBy: [{ set: 'Attributes', name: 'Storey', kind: 'attribute' }],
      root: [
        {
          id: 'p:L1',
          name: 'L1',
          kind: 'item',
          source: 'property',
          ids: [3],
          assemblyId: 'a1',
          children: [],
        },
      ],
      qtyBindings: {},
      excludedLines: {},
    }
    expect(parseSessionJson(JSON.stringify(withEstimation))?.estimation.boqs[0]?.root[0]?.assemblyId).toBe('a1')
    const legacyLinks = JSON.parse(JSON.stringify(emptySession('abc', 'a.ifc'))) as { estimation?: unknown }
    delete legacyLinks.estimation
    expect(parseSessionJson(JSON.stringify(legacyLinks))?.estimation.boqs[0]?.root).toEqual([])
  })

  it('maps leftover Breakdown and Lens tabs onto Filters', () => {
    const session = emptySession('abc', 'a.ifc') as { leftTab: string }
    session.leftTab = 'breakdown'
    expect(parseSessionJson(JSON.stringify(session))?.leftTab).toBe('filters')
    session.leftTab = 'lens'
    expect(parseSessionJson(JSON.stringify(session))?.leftTab).toBe('filters')
    session.leftTab = 'views'
    expect(parseSessionJson(JSON.stringify(session))?.leftTab).toBe('views')
  })
})
