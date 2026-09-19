import { hexToRgba, uniqueColor, type RGBAColor } from '@ifc-lite/lens'

export const MISSING_VALUE = '—'

export type PropertyKind = 'property' | 'quantity' | 'attribute'

export type PropertyRef = {
  set: string
  name: string
  kind: PropertyKind
}

export type PropertyTreeNode = {
  key: string
  label: string
  count: number
  ids: number[]
  children: PropertyTreeNode[]
  color?: string
}

export const ATTRIBUTE_SET = 'Attributes'

export const ATTRIBUTE_IFC_TYPE: PropertyRef = { set: ATTRIBUTE_SET, name: 'IFC Type', kind: 'attribute' }
export const ATTRIBUTE_STOREY: PropertyRef = { set: ATTRIBUTE_SET, name: 'Storey', kind: 'attribute' }
export const ATTRIBUTE_NAME: PropertyRef = { set: ATTRIBUTE_SET, name: 'Name', kind: 'attribute' }
export const ATTRIBUTE_MATERIAL: PropertyRef = { set: ATTRIBUTE_SET, name: 'Material', kind: 'attribute' }

export const ATTRIBUTE_REFS: PropertyRef[] = [
  ATTRIBUTE_IFC_TYPE,
  ATTRIBUTE_STOREY,
  ATTRIBUTE_NAME,
  ATTRIBUTE_MATERIAL,
]

export function propertyRefKey(ref: PropertyRef): string {
  return `${ref.kind}:${ref.set}.${ref.name}`
}

export function samePropertyRef(left: PropertyRef, right: PropertyRef): boolean {
  return propertyRefKey(left) === propertyRefKey(right)
}

export function propertyRefLabel(ref: PropertyRef): string {
  return ref.kind === 'attribute' ? ref.name : `${ref.set}.${ref.name}`
}

export const MAX_FILTER_RULES = 3

export function isIfcTypeRef(ref: PropertyRef): boolean {
  return ref.kind === 'attribute' && ref.name === 'IFC Type'
}

export function addFilterRule(rules: PropertyRef[], ref: PropertyRef): PropertyRef[] {
  if (rules.some((rule) => samePropertyRef(rule, ref))) return rules
  if (rules.length >= MAX_FILTER_RULES) return rules
  return [...rules, ref]
}

export function removeFilterRule(rules: PropertyRef[], ref: PropertyRef): PropertyRef[] {
  return rules.filter((rule) => !samePropertyRef(rule, ref))
}

/** Move a rule to `toIndex`. The nested value tree follows this order. */
export function moveFilterRule(rules: PropertyRef[], fromIndex: number, toIndex: number): PropertyRef[] {
  if (fromIndex === toIndex) return rules
  if (fromIndex < 0 || fromIndex >= rules.length) return rules
  if (toIndex < 0 || toIndex >= rules.length) return rules
  const next = [...rules]
  const [item] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, item)
  return next
}

/** Clicking an already-used property makes it the top grouping; others keep order. */
export function promoteFilterRule(rules: PropertyRef[], ref: PropertyRef): PropertyRef[] {
  const fromIndex = rules.findIndex((rule) => samePropertyRef(rule, ref))
  if (fromIndex <= 0) return rules
  return moveFilterRule(rules, fromIndex, 0)
}

export function parsePropertyRef(value: unknown): PropertyRef | null {
  if (!value || typeof value !== 'object') return null
  const row = value as { set?: unknown; name?: unknown; kind?: unknown }
  const set = typeof row.set === 'string' ? row.set : ''
  const name = typeof row.name === 'string' ? row.name.trim() : ''
  const kind = row.kind
  if (!name) return null
  if (kind !== 'property' && kind !== 'quantity' && kind !== 'attribute') return null
  return { set, name, kind }
}

export function parsePropertyRefs(value: unknown): PropertyRef[] {
  if (!Array.isArray(value)) return []
  const rows: PropertyRef[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const row = item as { set?: unknown; name?: unknown; kind?: unknown }
    const parsed = parsePropertyRef(row)
    if (!parsed) continue
    rows.push(parsed)
    if (rows.length >= MAX_FILTER_RULES) break
  }
  return rows
}

export function exactValueLabel(value: string | null | undefined, numeric: number | null | undefined): string {
  if (value != null && value !== '') return value
  if (numeric != null && Number.isFinite(numeric)) return String(numeric)
  return MISSING_VALUE
}

export function nestByValues(
  ids: number[],
  layers: Array<Map<number, string>>,
  prefix = '',
): PropertyTreeNode[] {
  if (layers.length === 0 || ids.length === 0) return []
  const [current, ...rest] = layers
  const buckets = new Map<string, number[]>()
  for (const id of ids) {
    const label = current.get(id) ?? MISSING_VALUE
    const list = buckets.get(label)
    if (list) list.push(id)
    else buckets.set(label, [id])
  }
  return [...buckets.entries()]
    .sort(([left], [right]) => compareValueLabels(left, right))
    .map(([label, groupIds]) => {
      const key = prefix ? `${prefix}/${label}` : label
      return {
        key,
        label,
        count: groupIds.length,
        ids: groupIds,
        children: rest.length > 0 ? nestByValues(groupIds, rest, key) : [],
      }
    })
}

export function compareValueLabels(left: string, right: string): number {
  if (left === MISSING_VALUE && right !== MISSING_VALUE) return 1
  if (right === MISSING_VALUE && left !== MISSING_VALUE) return -1
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' })
}

export function findPropertyNode(nodes: PropertyTreeNode[], key: string | null): PropertyTreeNode | null {
  if (!key) return null
  for (const node of nodes) {
    if (node.key === key) return node
    const nested = findPropertyNode(node.children, key)
    if (nested) return nested
  }
  return null
}

export function toggleFilterKeys(current: string[], key: string, additive: boolean): string[] {
  if (!additive) return [key]
  if (current.includes(key)) return current.filter((item) => item !== key)
  return [...current, key]
}

export function unionPropertyNodeIds(nodes: PropertyTreeNode[], keys: string[]): number[] {
  const ids = new Set<number>()
  for (const key of keys) {
    const node = findPropertyNode(nodes, key)
    if (!node) continue
    for (const id of node.ids) ids.add(id)
  }
  return [...ids]
}

export function propertySelectionLabel(nodes: PropertyTreeNode[], keys: string[], ruleName?: string): string | null {
  const labels: string[] = []
  for (const key of keys) {
    const node = findPropertyNode(nodes, key)
    if (node) labels.push(node.label)
  }
  if (labels.length === 0) return null
  const joined =
    labels.length <= 3 ? labels.join(' + ') : `${labels.slice(0, 2).join(' + ')} + ${labels.length - 2} more`
  return ruleName ? `${ruleName}: ${joined}` : joined
}

export function colorizeLeaves(nodes: PropertyTreeNode[]): PropertyTreeNode[] {
  let index = 0
  const walk = (list: PropertyTreeNode[]): PropertyTreeNode[] =>
    list.map((node) => {
      if (node.children.length === 0) {
        return { ...node, color: uniqueColor(index++) }
      }
      return { ...node, children: walk(node.children) }
    })
  return walk(nodes)
}

export function colorMapFromTree(nodes: PropertyTreeNode[]): Map<number, RGBAColor> {
  const map = new Map<number, RGBAColor>()
  const walk = (list: PropertyTreeNode[]) => {
    for (const node of list) {
      if (node.color) {
        const rgba = hexToRgba(node.color, 1)
        for (const id of node.ids) map.set(id, rgba)
      }
      if (node.children.length > 0) walk(node.children)
    }
  }
  walk(nodes)
  return map
}
