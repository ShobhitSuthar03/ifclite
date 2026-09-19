import { expressIdsByGlobalIds, type BimDatabase } from '@/lib/bim-sql'
import type { IfcDataStore } from '@/lib/ifc-data'

/** Splits pasted text into individual GlobalId candidates — one per line, or comma/whitespace separated. */
export function parseGlobalIds(text: string): string[] {
  const ids = text
    .split(/[\s,]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0)
  return [...new Set(ids)]
}

export type GuidResolution = {
  found: Map<string, number>
  missing: string[]
}

/** Resolves a batch of IFC GlobalId strings to expressIds, using whichever data source is loaded. */
export function resolveGlobalIds(
  globalIds: string[],
  store: IfcDataStore | null,
  warehouse: BimDatabase | null,
): GuidResolution {
  const found = new Map<string, number>()
  const missing: string[] = []

  if (store) {
    for (const globalId of globalIds) {
      const expressId = store.entities.getExpressIdByGlobalId(globalId)
      if (expressId >= 0) found.set(globalId, expressId)
      else missing.push(globalId)
    }
    return { found, missing }
  }

  if (warehouse) {
    const resolved = expressIdsByGlobalIds(warehouse, globalIds)
    for (const globalId of globalIds) {
      const expressId = resolved.get(globalId)
      if (expressId !== undefined) found.set(globalId, expressId)
      else missing.push(globalId)
    }
    return { found, missing }
  }

  return { found, missing: globalIds }
}
