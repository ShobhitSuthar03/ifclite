import { tryEvaluateFormula, type FormulaResolver } from '@/lib/cost-assembly/formula'
import type { BuildUpRow } from '@/lib/cost-assembly/build-up'

/** Re-evaluates a row's QuantityDetail formula against resolved parameters, falling back to
 *  the catalog's static Quantity when there's no formula or it can't be evaluated. */
export function evaluatedRowQty(row: Pick<BuildUpRow, 'qty' | 'quantityDetail'>, resolve: FormulaResolver): number {
  const fallback = row.qty ?? 0
  return tryEvaluateFormula(row.quantityDetail, resolve, fallback)
}

/**
 * A cost assembly nests SubItems inside SubItems inside CoCDetail cost lines: each group's own
 * quantity (e.g. "Bekistingsratio" m2 of formwork per m3 of concrete) is meant to scale
 * everything under it, not just sit there for display. This walks the flattened row list
 * (parents always appear before their descendants) and returns, for every row id, the product
 * of every ancestor group's own qty*factor*extraFactors — i.e. what a leaf's own amount still
 * needs to be multiplied by to get its real contribution to the assembly total.
 */
export function ancestorMultipliers(rows: BuildUpRow[], resolve: FormulaResolver): Map<string, number> {
  const multiplier = new Map<string, number>()
  for (const row of rows) {
    const parentMultiplier = row.parentId ? (multiplier.get(row.parentId) ?? 1) : 1
    if (row.hasChildren) {
      const ownQty = evaluatedRowQty(row, resolve)
      multiplier.set(row.id, parentMultiplier * ownQty * row.factor * row.extraFactors)
    } else {
      multiplier.set(row.id, parentMultiplier)
    }
  }
  return multiplier
}
