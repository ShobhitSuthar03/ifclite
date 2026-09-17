import { ATTRIBUTE_SET, propertyRefKey, type PropertyRef } from '@/lib/property-tree'
import type { PropertyCatalogSet } from '@/lib/bim-sql'
import { MISSING_VALUE } from '@/lib/property-tree'
import type { SavedView } from '@/lib/saved-views'

export type AssemblyLinkMode = 'property' | 'view'

export type AssemblyLink =
  | {
      assemblyId: string
      mode: 'property'
      property: PropertyRef
    }
  | {
      assemblyId: string
      mode: 'view'
      viewId: string
    }

export const LINK_ATTRIBUTE_REFS: PropertyRef[] = [
  { set: ATTRIBUTE_SET, name: 'ObjectType', kind: 'attribute' },
  { set: ATTRIBUTE_SET, name: 'Tag', kind: 'attribute' },
  { set: ATTRIBUTE_SET, name: 'Name', kind: 'attribute' },
  { set: ATTRIBUTE_SET, name: 'IFC Type', kind: 'attribute' },
]

export function normalizeAssemblyCode(value: string): string {
  return value.trim().toLowerCase().replace(/\.+$/, '')
}

/** Hierarchical assembly codes: 26.21.11 matches 26.21.11 and 26.21.11.xxx, not 26.21. */
export function valueMatchesCode(raw: string | null | undefined, code: string): boolean {
  if (!raw || raw === MISSING_VALUE) return false
  const value = normalizeAssemblyCode(raw)
  const needle = normalizeAssemblyCode(code)
  if (!value || !needle) return false
  return value === needle || value.startsWith(`${needle}.`)
}

export function idsMatchingAssemblyCode(labels: Map<number, string>, code: string): number[] {
  const ids: number[] = []
  for (const [id, label] of labels) {
    if (valueMatchesCode(label, code)) ids.push(id)
  }
  ids.sort((left, right) => left - right)
  return ids
}

export function upsertAssemblyLink(links: AssemblyLink[], next: AssemblyLink): AssemblyLink[] {
  return [...links.filter((link) => link.assemblyId !== next.assemblyId), next]
}

export function removeAssemblyLink(links: AssemblyLink[], assemblyId: string): AssemblyLink[] {
  return links.filter((link) => link.assemblyId !== assemblyId)
}

export function linkForAssembly(links: AssemblyLink[], assemblyId: string): AssemblyLink | undefined {
  return links.find((link) => link.assemblyId === assemblyId)
}

export function parseAssemblyLinks(value: unknown): AssemblyLink[] {
  if (!Array.isArray(value)) return []
  const links: AssemblyLink[] = []
  const seen = new Set<string>()
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const row = item as {
      assemblyId?: unknown
      mode?: unknown
      property?: unknown
      viewId?: unknown
    }
    const assemblyId = typeof row.assemblyId === 'string' ? row.assemblyId : ''
    if (!assemblyId || seen.has(assemblyId)) continue
    if (row.mode === 'view') {
      const viewId = typeof row.viewId === 'string' ? row.viewId : ''
      if (!viewId) continue
      seen.add(assemblyId)
      links.push({ assemblyId, mode: 'view', viewId })
      continue
    }
    if (row.mode !== 'property') continue
    const property = parseOnePropertyRef(row.property)
    if (!property) continue
    seen.add(assemblyId)
    links.push({ assemblyId, mode: 'property', property })
  }
  return links
}

function parseOnePropertyRef(value: unknown): PropertyRef | null {
  if (!value || typeof value !== 'object') return null
  const row = value as { set?: unknown; name?: unknown; kind?: unknown }
  const name = typeof row.name === 'string' ? row.name.trim() : ''
  const kind = row.kind
  if (!name) return null
  if (kind !== 'property' && kind !== 'quantity' && kind !== 'attribute') return null
  return { set: typeof row.set === 'string' ? row.set : '', name, kind }
}

export function suggestedLinkProperty(catalog: PropertyCatalogSet[]): PropertyRef {
  const ranked = [/assembly/, /baustein/, /bstn/, /classif/, /\bcode\b/, /objecttype/, /reference/]
  for (const pattern of ranked) {
    for (const group of catalog) {
      for (const name of group.names) {
        const haystack = `${group.set} ${name}`.toLowerCase()
        if (!pattern.test(haystack)) continue
        return { set: group.set, name, kind: group.kind }
      }
    }
  }
  return LINK_ATTRIBUTE_REFS[0]
}

export function linkPropertyOptions(catalog: PropertyCatalogSet[]): PropertyCatalogSet[] {
  const extra = LINK_ATTRIBUTE_REFS.filter(
    (ref) => !catalog.some((group) => group.kind === 'attribute' && group.names.includes(ref.name)),
  )
  const attributes: PropertyCatalogSet = {
    set: ATTRIBUTE_SET,
    kind: 'attribute',
    names: [
      ...LINK_ATTRIBUTE_REFS.map((ref) => ref.name),
      ...(catalog.find((group) => group.kind === 'attribute')?.names ?? []).filter(
        (name) => !LINK_ATTRIBUTE_REFS.some((ref) => ref.name === name),
      ),
    ],
  }
  const rest = catalog.filter((group) => group.kind !== 'attribute')
  return extra.length > 0 || attributes.names.length > 0 ? [attributes, ...rest] : catalog
}

export function optionValue(ref: PropertyRef): string {
  return propertyRefKey(ref)
}

export function parseOptionValue(value: string): PropertyRef | null {
  const match = value.match(/^(property|quantity|attribute):(.+)\.(.+)$/)
  if (!match) return null
  return { kind: match[1] as PropertyRef['kind'], set: match[2], name: match[3] }
}

export function uniqueLinkProperties(links: AssemblyLink[]): PropertyRef[] {
  const seen = new Map<string, PropertyRef>()
  for (const link of links) {
    if (link.mode !== 'property') continue
    seen.set(propertyRefKey(link.property), link.property)
  }
  return [...seen.values()]
}

export function resolveLinkedIds(
  links: AssemblyLink[],
  assemblies: Array<{ id: string; code: string }>,
  views: SavedView[],
  labelsByProperty: Map<string, Map<number, string>>,
): Record<string, number[]> {
  const codeById = new Map(assemblies.map((item) => [item.id, item.code]))
  const viewIds = new Map(views.map((view) => [view.id, view.ids]))
  const out: Record<string, number[]> = {}
  for (const link of links) {
    if (link.mode === 'view') {
      out[link.assemblyId] = [...(viewIds.get(link.viewId) ?? [])]
      continue
    }
    const code = codeById.get(link.assemblyId)
    const labels = labelsByProperty.get(propertyRefKey(link.property))
    out[link.assemblyId] = code && labels ? idsMatchingAssemblyCode(labels, code) : []
  }
  return out
}
