import { describe, expect, it } from 'vitest'
import { evaluateFormula, tryEvaluateFormula } from '@/lib/cost-assembly/formula'

function resolverFrom(values: Record<string, number>) {
  return (name: string) => values[name] ?? 0
}

describe('evaluateFormula', () => {
  it('evaluates plain arithmetic with comma or dot decimals', () => {
    expect(evaluateFormula('1/0,95', resolverFrom({}))).toBeCloseTo(1.0526315789)
    expect(evaluateFormula('2*2,5', resolverFrom({}))).toBeCloseTo(5)
    expect(evaluateFormula('8000/7850/25000', resolverFrom({}))).toBeCloseTo(4.076e-5)
  })

  it('resolves bare identifiers against the given parameter values', () => {
    expect(evaluateFormula('Bekistingsopp/Volume', resolverFrom({ Bekistingsopp: 26, Volume: 10 }))).toBeCloseTo(2.6)
    expect(evaluateFormula('d_Wand-d_Predal', resolverFrom({ d_Wand: 0.3, d_Predal: 0.05 }))).toBeCloseTo(0.25)
  })

  it('strips a trailing quoted unit annotation', () => {
    expect(evaluateFormula("Schoring_Linteel  'LM'", resolverFrom({ Schoring_Linteel: 4 }))).toBe(4)
  })

  it('evaluates if() with the ; argument separator used instead of ,', () => {
    const resolve = resolverFrom({ Betonsterkte: 2530 })
    expect(evaluateFormula('if(Betonsterkte==2530;1;0)/0,95', resolve)).toBeCloseTo(1.0526315789)
    expect(evaluateFormula('if(Betonsterkte==3037;1;0)/0,95', resolve)).toBe(0)
  })

  it('supports comparison operators seen in the catalog', () => {
    expect(evaluateFormula('if(Aantal_pompen>0;1/0,95;0)', resolverFrom({ Aantal_pompen: 1 }))).toBeCloseTo(1.0526315789)
    expect(evaluateFormula('if(Aantal_pompen>0;1/0,95;0)', resolverFrom({ Aantal_pompen: 0 }))).toBe(0)
    expect(evaluateFormula('if(d_Plaat>=0,40;1/d_Plaat;0)', resolverFrom({ d_Plaat: 0.5 }))).toBeCloseTo(2)
  })

  it('throws on malformed input rather than guessing', () => {
    expect(() => evaluateFormula('', resolverFrom({}))).toThrow()
    expect(() => evaluateFormula('if(1;2)', resolverFrom({}))).toThrow()
    expect(() => evaluateFormula('1 +', resolverFrom({}))).toThrow()
  })

  it('tryEvaluateFormula falls back instead of throwing', () => {
    expect(tryEvaluateFormula(undefined, resolverFrom({}), 7)).toBe(7)
    expect(tryEvaluateFormula('1 +', resolverFrom({}), 7)).toBe(7)
    expect(tryEvaluateFormula('2*3', resolverFrom({}), 7)).toBe(6)
  })
})
