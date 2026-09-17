import type { QuantityResult } from '@/lib/geometry-qto'

export type QtyMethod = 'count' | 'volume' | 'area' | 'length'

export function uomMethod(uom: string): QtyMethod {
  const text = uom.trim().toLowerCase().replace(/³/g, '3').replace(/²/g, '2')
  if (/(^|\b)(m3|cu\.?\s*m)(\b|$)/.test(text) || text.includes('m3')) return 'volume'
  if (/(^|\b)(m2|sq\.?\s*m)(\b|$)/.test(text) || text.includes('m2')) return 'area'
  if (/(^|\b)(lm|ml|m1)(\b|$)/.test(text) || text === 'm' || text.includes('length')) return 'length'
  return 'count'
}

export function quantityForIds(
  ids: number[],
  uom: string,
  quantities: QuantityResult | null,
): { qty: number; method: QtyMethod } {
  const method = uomMethod(uom)
  if (method === 'count' || !quantities || ids.length === 0) {
    return { qty: ids.length, method: method === 'count' || !quantities ? 'count' : method }
  }
  const byId = new Map(quantities.elements.map((element) => [element.expressId, element]))
  let qty = 0
  let found = 0
  for (const id of ids) {
    const element = byId.get(id)
    if (!element) continue
    found += 1
    if (method === 'volume') qty += element.metrics.VOLUME
    else if (method === 'area') qty += element.metrics.GROSSAREA
    else qty += element.metrics.LENGTH
  }
  if (found === 0) return { qty: ids.length, method: 'count' }
  return { qty, method }
}
