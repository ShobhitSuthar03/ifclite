import type { CostComponent, CostKind, EstimateDetails, SubItem } from '@/lib/cost-assembly/types'
import { displayText, englishHint } from '@/lib/cost-assembly/types'

export type BuildUpRow = {
  id: string
  parentId: string | null
  hasChildren: boolean
  indent: number
  kind: CostKind | 'group'
  code: string
  description: string
  qty: number | null
  /** The raw QuantityDetail formula string this row's `qty` was computed from, if any. */
  quantityDetail?: string
  unit: string
  factor: number
  extraFactors: number
  rate: number | null
  amount: number | null
  muted: boolean
  note?: string
}

export function buildUpRows(details: EstimateDetails, indent = 0, prefix = '', parentId: string | null = null): BuildUpRow[] {
  const rows: BuildUpRow[] = []
  details.subItems.forEach((item, index) => {
    rows.push(...subItemRows(item, indent, `${prefix}s${index}`, parentId))
  })
  details.components.forEach((component, index) => {
    rows.push(componentRow(component, indent, `${prefix}c${index}`, parentId))
  })
  return rows
}

function subItemRows(item: SubItem, indent: number, id: string, parentId: string | null): BuildUpRow[] {
  const amount = rollUpDetailsAmount(item.details)
  const childCount = item.details.components.length + item.details.subItems.length
  const rows: BuildUpRow[] = [
    {
      id,
      parentId,
      hasChildren: childCount > 0,
      indent,
      kind: 'group',
      code: item.number,
      description: englishHint(item.text) || displayText(item.text) || 'Group',
      qty: item.quantity,
      quantityDetail: item.quantityDetail,
      unit: item.unitOfMeasure ?? '',
      factor: item.factor,
      extraFactors: item.costFactor,
      rate: null,
      amount,
      muted: item.disabled || item.quantity === 0,
    },
  ]
  item.details.components.forEach((component, index) => {
    rows.push(componentRow(component, indent + 1, `${id}-c${index}`, id))
  })
  item.details.subItems.forEach((child, index) => {
    rows.push(...subItemRows(child, indent + 1, `${id}-s${index}`, id))
  })
  return rows
}

function componentRow(component: CostComponent, indent: number, id: string, parentId: string | null): BuildUpRow {
  const extra = englishHint(component.extraDescription)
  return {
    id,
    parentId,
    hasChildren: false,
    indent,
    kind: component.kind,
    code: component.name,
    description: extra || englishHint(component.description) || displayText(component.description),
    qty: component.quantity,
    quantityDetail: component.quantityDetail,
    unit: '',
    factor: component.factor,
    extraFactors: component.costFactor * component.cFactor * component.qFactor,
    rate: component.unitRate,
    amount: component.amount,
    muted: component.disabled || component.quantity === 0,
    note: extra ? englishHint(component.description) : component.factorDetail,
  }
}

export function rollUpDetailsAmount(details: EstimateDetails): number {
  let total = 0
  for (const component of details.components) {
    if (!component.disabled) total += component.amount
  }
  for (const item of details.subItems) {
    if (!item.disabled) total += rollUpDetailsAmount(item.details)
  }
  return total
}
