import { describe, expect, it } from 'vitest'
import { parseGlobalIds, resolveGlobalIds } from '@/lib/guid-search'

describe('parseGlobalIds', () => {
  it('parses a single GUID', () => {
    expect(parseGlobalIds('1dN3$_JYmo_I7TaDZoCvJS')).toEqual(['1dN3$_JYmo_I7TaDZoCvJS'])
  })

  it('parses a newline-separated list', () => {
    const text = '1dN3$_JYmo_I7TaDZoCvJS\n3oNZ7u96BA3_WCVSyv6U9w\n\n3cvOHPHAI$jhs73Din_1fq'
    expect(parseGlobalIds(text)).toEqual(['1dN3$_JYmo_I7TaDZoCvJS', '3oNZ7u96BA3_WCVSyv6U9w', '3cvOHPHAI$jhs73Din_1fq'])
  })

  it('parses a comma-separated list and trims whitespace', () => {
    const text = ' 1dN3$_JYmo_I7TaDZoCvJS ,  3oNZ7u96BA3_WCVSyv6U9w'
    expect(parseGlobalIds(text)).toEqual(['1dN3$_JYmo_I7TaDZoCvJS', '3oNZ7u96BA3_WCVSyv6U9w'])
  })

  it('deduplicates repeated GUIDs', () => {
    expect(parseGlobalIds('abc abc\nabc')).toEqual(['abc'])
  })

  it('returns an empty list for blank input', () => {
    expect(parseGlobalIds('   \n  ')).toEqual([])
  })
})

describe('resolveGlobalIds', () => {
  it('reports every id as missing when neither store nor warehouse is loaded', () => {
    const result = resolveGlobalIds(['a', 'b'], null, null)
    expect(result.found.size).toBe(0)
    expect(result.missing).toEqual(['a', 'b'])
  })

  it('resolves via the store when present, splitting found vs missing', () => {
    const store = {
      entities: {
        getExpressIdByGlobalId: (id: string) => (id === 'a' ? 42 : -1),
      },
    } as unknown as Parameters<typeof resolveGlobalIds>[1]
    const result = resolveGlobalIds(['a', 'b'], store, null)
    expect(result.found.get('a')).toBe(42)
    expect(result.missing).toEqual(['b'])
  })
})
