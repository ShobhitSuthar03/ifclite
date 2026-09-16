import type { QuantityResult } from '@/lib/geometry-qto/types'

export const QUANTITIES_STORE_VERSION = 1 as const

export type StoredQuantities = {
  version: typeof QUANTITIES_STORE_VERSION
  cacheKey: string
  result: QuantityResult
}

export function isCompleteTakeoff(result: QuantityResult | null | undefined): boolean {
  if (!result || result.elements.length === 0) return false
  return result.elements.some((element) => element.faces.length > 0)
}

export function encodeStoredQuantities(cacheKey: string, result: QuantityResult): string {
  const payload: StoredQuantities = {
    version: QUANTITIES_STORE_VERSION,
    cacheKey,
    result,
  }
  return JSON.stringify(payload)
}

export function parseStoredQuantities(json: string, expectedCacheKey?: string): QuantityResult | null {
  try {
    const parsed = JSON.parse(json) as StoredQuantities | QuantityResult
    if (parsed && typeof parsed === 'object' && 'version' in parsed && 'result' in parsed) {
      if (parsed.version !== QUANTITIES_STORE_VERSION) return null
      if (expectedCacheKey && parsed.cacheKey && parsed.cacheKey !== expectedCacheKey) return null
      return isCompleteTakeoff(parsed.result) ? parsed.result : null
    }
    if (parsed && typeof parsed === 'object' && 'elements' in parsed) {
      return isCompleteTakeoff(parsed) ? parsed : null
    }
    return null
  } catch {
    return null
  }
}

/** IFC-safe single property name typed by the user (not a generated pair of names). */
export function sanitizePropertyName(raw: string): string {
  return raw
    .trim()
    .replace(/[^\p{L}\p{N}_ -]/gu, '')
    .replace(/\s+/g, ' ')
    .slice(0, 64)
    .trim()
}
