export type DisplayMode = 'all' | 'ghost' | 'isolate'

/**
 * Non-physical IFC types the geometry pipeline renders as translucent debug
 * overlays rather than real materials — opening voids used only to cut holes
 * into walls/slabs, and room/zone volumes. Most BIM viewers (BIMcollab,
 * Solibri, …) hide these by default, so the viewer does too, but the user can
 * toggle each group back on.
 */
export const OPENING_IFC_TYPES: ReadonlySet<string> = new Set(['IfcOpeningElement'])
export const SPATIAL_IFC_TYPES: ReadonlySet<string> = new Set(['IfcSpace', 'IfcSpatialZone'])

export function nextHiddenSet(current: Set<number>, id: number): Set<number> {
  const next = new Set(current)
  next.add(id)
  return next
}

export function visibleExpressIds(
  allIds: Iterable<number>,
  filterIds: Set<number> | null,
  isolateIds: Set<number> | null,
  hiddenIds: Set<number>,
): Set<number> {
  const visible = new Set<number>()
  for (const id of allIds) {
    if (hiddenIds.has(id)) continue
    if (filterIds && !filterIds.has(id)) continue
    if (isolateIds && !isolateIds.has(id)) continue
    visible.add(id)
  }
  return visible
}

export function ghostExpressIds(
  mode: DisplayMode,
  focusIds: Set<number>,
  allIds: Iterable<number>,
  filterIds: Set<number> | null,
  hiddenIds: Set<number>,
): Set<number> {
  if (mode !== 'ghost') return new Set()
  const ghost = new Set<number>()
  for (const id of allIds) {
    if (hiddenIds.has(id) || focusIds.has(id)) continue
    if (filterIds && !filterIds.has(id)) continue
    ghost.add(id)
  }
  return ghost
}
