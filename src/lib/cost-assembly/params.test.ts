import { describe, expect, it } from 'vitest'
import { makeParameterResolver, parameterOverrideKey, resolvedParameterValues } from '@/lib/cost-assembly/params'
import type { AssemblyParameter } from '@/lib/cost-assembly/types'

function parameter(code: string, value: string): AssemblyParameter {
  return { code, description: code, type: 'Addable', value }
}

const ASSEMBLY = {
  id: 'a1',
  parameters: [
    parameter('Volume', '_LVMenge'),
    parameter('Bekistingsopp', '0'),
    parameter('Bekistingsratio', 'Bekistingsopp/Volume'),
    parameter('Betonsterkte', '2530'),
  ],
}

describe('makeParameterResolver', () => {
  it('substitutes the live bound quantity for _LVMenge', () => {
    const resolve = makeParameterResolver(ASSEMBLY, undefined, 12)
    expect(resolve('Volume')).toBe(12)
  })

  it('chains parameter formulas that reference other parameters', () => {
    const resolve = makeParameterResolver(
      { ...ASSEMBLY, parameters: [...ASSEMBLY.parameters.slice(0, 1), parameter('Bekistingsopp', '26'), ASSEMBLY.parameters[2]] },
      undefined,
      10,
    )
    expect(resolve('Bekistingsratio')).toBeCloseTo(2.6)
  })

  it('lets a user override win over the catalog default', () => {
    const overrides = { [parameterOverrideKey('a1', 'Betonsterkte')]: '3037' }
    const resolve = makeParameterResolver(ASSEMBLY, overrides, null)
    expect(resolve('Betonsterkte')).toBe(3037)
  })

  it('falls back to 1 (not a silent 0) for an unresolvable/circular reference instead of throwing', () => {
    const cyclic = { id: 'a2', parameters: [parameter('X', 'Y'), parameter('Y', 'X')] }
    const resolve = makeParameterResolver(cyclic, undefined, null)
    expect(resolve('X')).toBe(1)
  })

  it('a parameter with no override and no catalog value defaults to 1, not 0', () => {
    const assembly = { id: 'a3', parameters: [parameter('Bekistingsopp', '')] }
    const resolve = makeParameterResolver(assembly, undefined, null)
    expect(resolve('Bekistingsopp')).toBe(1)
  })

  it('resolvedParameterValues resolves every parameter into a map', () => {
    const values = resolvedParameterValues(ASSEMBLY, undefined, 8)
    expect(values.get('Volume')).toBe(8)
    expect(values.get('Betonsterkte')).toBe(2530)
  })
})
