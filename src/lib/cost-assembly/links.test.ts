import { describe, expect, it } from 'vitest'
import {
  idsMatchingAssemblyCode,
  parseAssemblyLinks,
  parseOptionValue,
  resolveLinkedIds,
  suggestedLinkProperty,
  upsertAssemblyLink,
  valueMatchesCode,
} from '@/lib/cost-assembly/links'

describe('assembly code matching', () => {
  it('matches the assembly code and longer suffixes, not a parent division', () => {
    expect(valueMatchesCode('26.21.11.', '26.21.11.')).toBe(true)
    expect(valueMatchesCode('26.21.11', '26.21.11.')).toBe(true)
    expect(valueMatchesCode('26.21.11.A', '26.21.11.')).toBe(true)
    expect(valueMatchesCode('26.21', '26.21.11.')).toBe(false)
    expect(valueMatchesCode('26.22.00.', '26.21.11.')).toBe(false)
    expect(valueMatchesCode('—', '26.21.11.')).toBe(false)
  })

  it('collects matching express ids', () => {
    const labels = new Map([
      [10, '26.22.00'],
      [11, '26.21.11.extra'],
      [12, 'wall'],
    ])
    expect(idsMatchingAssemblyCode(labels, '26.22.00.')).toEqual([10])
  })
})

describe('assembly links', () => {
  it('parses property and view links and ignores junk', () => {
    const links = parseAssemblyLinks([
      {
        assemblyId: 'a',
        mode: 'property',
        property: { set: 'Attributes', name: 'ObjectType', kind: 'attribute' },
      },
      { assemblyId: 'b', mode: 'view', viewId: 'view-1' },
      { assemblyId: 'a', mode: 'view', viewId: 'dup' },
      { mode: 'view' },
    ])
    expect(links).toEqual([
      {
        assemblyId: 'a',
        mode: 'property',
        property: { set: 'Attributes', name: 'ObjectType', kind: 'attribute' },
      },
      { assemblyId: 'b', mode: 'view', viewId: 'view-1' },
    ])
  })

  it('replaces an existing link for the same assembly', () => {
    const next = upsertAssemblyLink(
      [{ assemblyId: 'a', mode: 'view', viewId: 'old' }],
      {
        assemblyId: 'a',
        mode: 'property',
        property: { set: 'Pset', name: 'Code', kind: 'property' },
      },
    )
    expect(next).toHaveLength(1)
    expect(next[0]).toMatchObject({ mode: 'property', assemblyId: 'a' })
  })

  it('suggests an assembly-like property when the catalog has one', () => {
    const ref = suggestedLinkProperty([
      { set: 'Pset_Assembly', names: ['AssemblyCode'], kind: 'property' },
      { set: 'Qto', names: ['Volume'], kind: 'quantity' },
    ])
    expect(ref).toEqual({ set: 'Pset_Assembly', name: 'AssemblyCode', kind: 'property' })
  })

  it('round-trips a property option value', () => {
    expect(parseOptionValue('property:Pset.Code')).toEqual({
      kind: 'property',
      set: 'Pset',
      name: 'Code',
    })
  })

  it('resolves property matches and saved-view ids', () => {
    const labels = new Map([
      [101, '26.21.11'],
      [102, '26.21.11.A'],
      [103, '26.22.00'],
    ])
    const resolved = resolveLinkedIds(
      [
        {
          assemblyId: 'wall',
          mode: 'property',
          property: { set: 'Attributes', name: 'ObjectType', kind: 'attribute' },
        },
        { assemblyId: 'filter-view', mode: 'view', viewId: 'view-walls' },
        { assemblyId: 'missing-view', mode: 'view', viewId: 'gone' },
      ],
      [
        { id: 'wall', code: '26.21.11.' },
        { id: 'filter-view', code: '99' },
      ],
      [{ id: 'view-walls', name: 'Walls', ids: [7, 8], createdAt: 'now' }],
      new Map([['attribute:Attributes.ObjectType', labels]]),
    )
    expect(resolved.wall).toEqual([101, 102])
    expect(resolved['filter-view']).toEqual([7, 8])
    expect(resolved['missing-view']).toEqual([])
  })
})
