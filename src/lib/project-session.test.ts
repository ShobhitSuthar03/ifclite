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
  })
})
