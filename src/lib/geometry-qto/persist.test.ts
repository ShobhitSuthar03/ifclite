import { describe, expect, it } from 'vitest'
import { encodeStoredQuantities, isCompleteTakeoff, parseStoredQuantities, sanitizePropertyName } from '@/lib/geometry-qto/persist'
import type { QuantityResult } from '@/lib/geometry-qto/types'

function sample(faces: boolean): QuantityResult {
  return {
    elements: [
      {
        expressId: 1,
        ifcType: 'IfcWall',
        faces: faces
          ? [
              {
                faceId: '1:0',
                expressId: 1,
                ifcType: 'IfcWall',
                kind: 'lateral',
                normal: [1, 0, 0],
                grossArea: 3,
                overlapArea: 0,
                netArea: 3,
                overlappingIds: [],
                positions: [0, 0, 0, 1, 0, 0, 1, 1, 0],
              },
            ]
          : [],
        metrics: {
          AREAMAX: 3,
          AREAMIN: 1,
          LATERALAREA: 3,
          UNDERAREA: 0,
          TOPAREA: 0,
          GROSSAREA: 3,
          COVEREDAREA: 0,
          UNCOVEREDAREA: 3,
          CROSSAREA: 1,
          FOOTPRINTAREA: 1,
          VOLUME: 1,
          LENGTH: 4,
          WIDTH: 0.2,
          HEIGHT: 3,
          COUNT: 1,
        },
        grossArea: 3,
        overlapArea: 0,
        netArea: 3,
      },
    ],
    elementCount: 1,
    columnCount: 0,
    totals: {
      LATERALAREA: 3,
      UNDERAREA: 0,
      TOPAREA: 0,
      GROSSAREA: 3,
      COVEREDAREA: 0,
      UNCOVEREDAREA: 3,
      VOLUME: 1,
      LENGTH: 4,
      WIDTH: 0.2,
      HEIGHT: 3,
      COUNT: 1,
    },
    grossArea: 3,
    overlapArea: 0,
    netArea: 3,
  }
}

describe('stored quantities', () => {
  it('round-trips a complete takeoff and rejects a totals-only copy', () => {
    const json = encodeStoredQuantities('abc', sample(true))
    expect(parseStoredQuantities(json, 'abc')?.elements[0]?.faces).toHaveLength(1)
    expect(parseStoredQuantities(json, 'other')).toBeNull()
    expect(isCompleteTakeoff(sample(false))).toBe(false)
    expect(parseStoredQuantities(JSON.stringify(sample(false)))).toBeNull()
  })

  it('accepts a legacy QuantityResult that still has faces', () => {
    expect(parseStoredQuantities(JSON.stringify(sample(true)))?.elementCount).toBe(1)
  })

  it('treats a takeoff with faces but no overlay vertices as complete', () => {
    const result = sample(true)
    result.elements[0].faces[0].positions = []
    expect(isCompleteTakeoff(result)).toBe(true)
    expect(parseStoredQuantities(encodeStoredQuantities('abc', result), 'abc')?.elements[0]?.faces).toHaveLength(1)
  })
})

describe('sanitizePropertyName', () => {
  it('keeps a user-typed name and strips junk', () => {
    expect(sanitizePropertyName('  Formwork A  ')).toBe('Formwork A')
    expect(sanitizePropertyName('Net/Area*')).toBe('NetArea')
    expect(sanitizePropertyName('   ')).toBe('')
    expect(sanitizePropertyName('ManualFormworkNetArea')).toBe('ManualFormworkNetArea')
  })
})
