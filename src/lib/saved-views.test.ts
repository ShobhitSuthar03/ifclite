import { describe, expect, it } from 'vitest'
import {
  createSavedView,
  defaultViewName,
  parseSavedViews,
  replaceSavedViewIds,
  viewFileStem,
} from '@/lib/saved-views'

describe('saved views', () => {
  it('creates a named view from selected express ids', () => {
    const view = createSavedView('  Walls L1  ', [12, 12, 7, 0, -1], new Date('2026-09-16T10:00:00.000Z'))
    expect(view).toMatchObject({
      name: 'Walls L1',
      ids: [7, 12],
      createdAt: '2026-09-16T10:00:00.000Z',
    })
    expect(view?.id.startsWith('view-')).toBe(true)
    expect(createSavedView('', [1])).toBeNull()
    expect(createSavedView('Empty', [])).toBeNull()
  })

  it('replaces view ids from a later selection', () => {
    const view = createSavedView('A', [1, 2])
    expect(view).not.toBeNull()
    expect(replaceSavedViewIds(view!, [9, 9])).toMatchObject({ id: view!.id, name: 'A', ids: [9] })
    expect(replaceSavedViewIds(view!, [])).toBeNull()
  })

  it('parses stored views and skips junk', () => {
    expect(parseSavedViews(undefined)).toEqual([])
    expect(
      parseSavedViews([
        { id: 'a', name: 'Walls', ids: [3, 1, 1], createdAt: 'now' },
        { id: 'a', name: 'dup', ids: [4] },
        { name: 'missing id', ids: [1] },
        { id: 'b', name: '  ', ids: [1] },
        { id: 'c', name: 'None', ids: [] },
      ]),
    ).toEqual([{ id: 'a', name: 'Walls', ids: [1, 3], createdAt: 'now' }])
  })

  it('names and file stems stay usable', () => {
    expect(defaultViewName([])).toBe('View 1')
    expect(defaultViewName([{ id: 'a', name: 'X', ids: [1], createdAt: '' }])).toBe('View 2')
    expect(viewFileStem('Walls / L1')).toBe('walls-l1')
    expect(viewFileStem('   ')).toBe('view')
  })
})
