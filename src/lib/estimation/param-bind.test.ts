import { describe, expect, it } from 'vitest'
import type { PropertyCatalogSet } from '@/lib/bim-sql'
import type { AssemblyParameter } from '@/lib/cost-assembly/types'
import {
  buildMeasuredParams,
  measuredParamValue,
  paramBindingKey,
  paramSourceValue,
  parseParamSourceValue,
  suggestParamBinding,
  type ParamBinding,
} from '@/lib/estimation/param-bind'

function parameter(code: string, description: string, unit = '', value = ''): AssemblyParameter {
  return { code, description, unit, value, type: 'Addable' }
}

describe('suggestParamBinding', () => {
  it('never suggests anything for the live-quantity placeholder', () => {
    const p = parameter('Volume', 'Volume | Volume', 'm3', '_LVMenge')
    expect(suggestParamBinding(p)).toEqual({ mode: 'manual' })
  })

  it('prefers a real matching IFC property over a geometry metric', () => {
    const p = parameter('Betonsterkte', 'Sterkteklasse beton: | Strength class concrete:', '', '2530')
    const catalog: PropertyCatalogSet[] = [
      { set: 'Pset_ConcreteElementGeneral', kind: 'property', names: ['Betonsterkte', 'Other'] },
    ]
    expect(suggestParamBinding(p, catalog)).toEqual({
      mode: 'ifc',
      property: { set: 'Pset_ConcreteElementGeneral', name: 'Betonsterkte', kind: 'property' },
      combine: 'sum',
    })
  })

  it('never guesses a geometry takeoff metric on its own - that has to be picked explicitly', () => {
    const p = parameter('Bekistingsopp', 'Bekistingsoppervlakte: | Formwork area:', 'm2')
    expect(suggestParamBinding(p, [])).toEqual({ mode: 'manual' })
  })

  it('falls back to manual when nothing matches (e.g. a pump count)', () => {
    const p = parameter('Aantal_pompen', 'Aantal pompen in de complete eenheid', 'st', '0')
    expect(suggestParamBinding(p, [])).toEqual({ mode: 'manual' })
  })
})

describe('paramSourceValue / parseParamSourceValue round-trip', () => {
  it('round-trips manual, takeoff and ifc sources', () => {
    const manual: ParamBinding = { mode: 'manual' }
    const takeoff: ParamBinding = { mode: 'takeoff', field: 'VOLUME', combine: 'sum' }
    const ifc: ParamBinding = { mode: 'ifc', property: { set: 'Pset_Foo', name: 'Bar', kind: 'property' }, combine: 'average' }
    expect(parseParamSourceValue(paramSourceValue(manual))).toEqual({ mode: 'manual' })
    expect(parseParamSourceValue(paramSourceValue(takeoff))).toEqual({ mode: 'takeoff', field: 'VOLUME' })
    expect(parseParamSourceValue(paramSourceValue(ifc))).toEqual({
      mode: 'ifc',
      property: { set: 'Pset_Foo', name: 'Bar', kind: 'property' },
    })
  })
})

describe('measuredParamValue', () => {
  it('returns null for manual (caller falls back to the typed override)', () => {
    expect(measuredParamValue({ mode: 'manual' }, [1, 2], () => 99)).toBeNull()
  })

  it('sums across all given ids by default', () => {
    const binding: ParamBinding = { mode: 'takeoff', field: 'LATERALAREA', combine: 'sum' }
    expect(measuredParamValue(binding, [1, 2, 3], () => 30)).toBe(30)
  })

  it('averages per object when combine is average', () => {
    const binding: ParamBinding = { mode: 'takeoff', field: 'LATERALAREA', combine: 'average' }
    expect(measuredParamValue(binding, [1, 2, 3], () => 30)).toBe(10)
  })
})

describe('buildMeasuredParams', () => {
  it('leaves unbound parameters out entirely - they stay manual until the user picks a source', () => {
    const parameters = [
      parameter('Volume', 'Volume | Volume', 'm3', '_LVMenge'),
      parameter('Bekistingsopp', 'Formwork area', 'm2'),
      parameter('Aantal_pompen', 'Pump count', 'st', '0'),
    ]
    const measured = buildMeasuredParams(
      parameters,
      {},
      'a1',
      [10, 11],
      (ids, field) => (field === 'LATERALAREA' ? ids.length * 5 : 0),
    )
    expect(measured.size).toBe(0)
  })

  it('measures a parameter the user explicitly bound to a takeoff field', () => {
    const parameters = [parameter('Bekistingsopp', 'Formwork area', 'm2')]
    const bindings: Record<string, ParamBinding> = {
      [paramBindingKey('a1', 'Bekistingsopp')]: { mode: 'takeoff', field: 'LATERALAREA', combine: 'sum' },
    }
    const measured = buildMeasuredParams(
      parameters,
      bindings,
      'a1',
      [10, 11],
      (ids, field) => (field === 'LATERALAREA' ? ids.length * 5 : 0),
    )
    expect(measured.get('Bekistingsopp')).toBe(10)
  })
})
