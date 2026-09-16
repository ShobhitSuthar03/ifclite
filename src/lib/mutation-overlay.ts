import type { MutationPatch } from '@/lib/project-session'
import type { PropertyRef } from '@/lib/property-tree'

export type PropertyOverlay = Map<string, string>

export function overlayAttributeKey(expressId: number, name: string): string {
  return `a:${expressId}:${name.toLowerCase()}`
}

export function overlayPropertyKey(expressId: number, pset: string, name: string): string {
  return `p:${expressId}:${pset}:${name}`
}

export function overlayFromPatches(patches: MutationPatch[]): PropertyOverlay {
  const map: PropertyOverlay = new Map()
  for (const patch of patches) {
    if (patch.kind === 'attribute') {
      map.set(overlayAttributeKey(patch.expressId, patch.name), patch.value)
    } else if (patch.pset) {
      map.set(overlayPropertyKey(patch.expressId, patch.pset, patch.name), patch.value)
    }
  }
  return map
}

export function overlayLabel(overlay: PropertyOverlay | undefined, ref: PropertyRef, id: number): string | undefined {
  if (!overlay) return undefined
  if (ref.kind === 'attribute') return overlay.get(overlayAttributeKey(id, ref.name))
  if (ref.kind === 'property') return overlay.get(overlayPropertyKey(id, ref.set, ref.name))
  return undefined
}
