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
