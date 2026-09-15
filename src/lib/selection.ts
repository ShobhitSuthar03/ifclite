export function isAdditiveModifier(event: {
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
}): boolean {
  return event.ctrlKey || event.metaKey || event.shiftKey
}

export function toggleId(current: Set<number>, id: number): Set<number> {
  const next = new Set(current)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}

export function setsEqual(left: Set<number>, right: Set<number>): boolean {
  if (left.size !== right.size) return false
  for (const id of left) {
    if (!right.has(id)) return false
  }
  return true
}

export function applyClickSelection(
  current: Set<number>,
  id: number | null,
  additive: boolean,
): Set<number> {
  if (id == null) return additive ? current : new Set()
  if (additive) return toggleId(current, id)
  return new Set([id])
}

