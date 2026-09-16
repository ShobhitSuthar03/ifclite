import {
  evaluateAutoColorLens,
  evaluateLens,
  LENS_PALETTE,
  type AutoColorLegendEntry,
  type AutoColorSpec,
  type Lens,
  type LensDataProvider,
  type LensEvaluationResult,
  type LensOperator,
} from '@ifc-lite/lens'

type Action = 'colorize' | 'hide' | 'transparent'
type CatalogKind = 'property' | 'quantity'

export type EvaluatedLens = LensEvaluationResult & { legend: AutoColorLegendEntry[] }

export function evaluateActiveLens(lens: Lens, provider: LensDataProvider): EvaluatedLens {
  if (lens.autoColor) {
    return evaluateAutoColorLens(lens.autoColor, provider)
  }
  const result = evaluateLens(lens, provider)
  return {
    ...result,
    legend: lens.rules
      .filter((rule) => rule.enabled)
      .map((rule) => ({
        id: rule.id,
        name: rule.name,
        color: rule.color,
        count: result.ruleCounts.get(rule.id) ?? 0,
      })),
  }
}

export function createAutoColorLens(spec: AutoColorSpec, name: string): Lens {
  return {
    id: `user-auto-${spec.source}-${spec.psetName ?? ''}-${spec.propertyName ?? ''}-${Date.now()}`,
    name,
    rules: [],
    autoColor: spec,
  }
}

export function createPropertyColorLens(input: {
  propertySet: string
  propertyName: string
  operator: LensOperator
  propertyValue: string
  color?: string
  action?: Action
  kind?: CatalogKind
}): Lens {
  const label = `${input.propertySet}.${input.propertyName}`
  const quantity = input.kind === 'quantity' || input.propertySet.toLowerCase().startsWith('qto_')
  return {
    id: `user-prop-${Date.now()}`,
    name: label,
    rules: [
      {
        id: `rule-${Date.now()}`,
        name: label,
        enabled: true,
        criteria: quantity
          ? {
              type: 'quantity',
              quantitySet: input.propertySet,
              quantityName: input.propertyName,
              operator: input.operator,
              quantityValue: input.propertyValue,
            }
          : {
              type: 'property',
              propertySet: input.propertySet,
              propertyName: input.propertyName,
              operator: input.operator,
              propertyValue: input.propertyValue,
            },
        action: input.action ?? 'colorize',
        color: input.color ?? LENS_PALETTE[0],
      },
    ],
  }
}

export { LENS_PALETTE }
export type { Action as UserLensAction }
