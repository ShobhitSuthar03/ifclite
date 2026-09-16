export type TakeoffTarget = {
  key: string
  ids: number[]
  label: string
}

export type TakeoffProgress = {
  done: number
  total: number
}

export const TAKEOFF_CHUNK = 8

export function xorIds(ids: Iterable<number>): number {
  let value = 0
  for (const id of ids) value ^= id
  return value >>> 0
}

export function resolveTakeoffTarget(input: {
  specType: string
  specStorey: number | null
  filterPropertyKey: string | null
  filterNodeKey: string | null
  filterIds: number[] | null
  breakdownRuleKeys: string[]
  breakdownNodeKey: string | null
  breakdownIds: number[] | null
  selectedIds: number[]
}): TakeoffTarget {
  const scopePrefix = `${input.specType}:${input.specStorey ?? ''}`
  if (input.filterPropertyKey && input.filterNodeKey && input.filterIds && input.filterIds.length > 0) {
    return {
      key: `filter|${scopePrefix}|${input.filterPropertyKey}|${input.filterNodeKey}|${input.filterIds.length}|${xorIds(input.filterIds)}`,
      ids: input.filterIds,
      label: input.filterNodeKey.includes('/')
        ? input.filterNodeKey.replace(/\//g, ' · ')
        : `${input.filterPropertyKey.split('.').at(-1) ?? 'Property'} = ${input.filterNodeKey}`,
    }
  }
  if (input.breakdownNodeKey && input.breakdownIds && input.breakdownIds.length > 0) {
    return {
      key: `cbs|${scopePrefix}|${input.breakdownRuleKeys.join('+')}|${input.breakdownNodeKey}|${input.breakdownIds.length}|${xorIds(input.breakdownIds)}`,
      ids: input.breakdownIds,
      label: input.breakdownNodeKey.replace(/\//g, ' · '),
    }
  }
  if (input.selectedIds.length > 0) {
    return {
      key: `sel|${input.selectedIds.length}|${xorIds(input.selectedIds)}`,
      ids: input.selectedIds,
      label:
        input.selectedIds.length === 1
          ? `Element #${input.selectedIds[0]}`
          : `${input.selectedIds.length} selected elements`,
    }
  }
  return { key: '', ids: [], label: '' }
}

export function missingTakeoffIds(scopeIds: number[], measuredIds: Iterable<number>): number[] {
  const have = new Set(measuredIds)
  return scopeIds.filter((id) => !have.has(id))
}
