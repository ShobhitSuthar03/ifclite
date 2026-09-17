import { parseOptionValue, valueMatchesCode } from '@/lib/cost-assembly/links'
import type { BoqDoc, BoqNode } from '@/lib/estimation/types'
import { ATTRIBUTE_SET, MISSING_VALUE, propertyRefKey, type PropertyRef } from '@/lib/property-tree'
import { uniquePositiveIds } from '@/lib/saved-views'

export function parseMatchPropertyText(raw: string): PropertyRef | null {
  const text = raw.trim()
  if (!text) return null
  const keyed = parseOptionValue(text)
  if (keyed) return keyed
  const attrs = ['IFC Type', 'Storey', 'Name', 'Material', 'ObjectType', 'Tag']
  const attr = attrs.find((name) => name.toLowerCase() === text.toLowerCase())
  if (attr) return { set: ATTRIBUTE_SET, name: attr, kind: 'attribute' }
  const dot = text.lastIndexOf('.')
  if (dot > 0) {
    const set = text.slice(0, dot).trim()
    const name = text.slice(dot + 1).trim()
    if (set && name) {
      const kind = set.toLowerCase() === 'attributes' ? 'attribute' : 'property'
      return { set: kind === 'attribute' ? ATTRIBUTE_SET : set, name, kind }
    }
  }
  return { set: ATTRIBUTE_SET, name: text, kind: 'attribute' }
}

export function lineMatchValue(node: BoqNode): string {
  return (node.matchValue ?? node.assemblyCode ?? '').trim()
}

export function lineMatchProperty(node: BoqNode, fallback: PropertyRef | null): PropertyRef | null {
  return node.matchProperty ?? fallback
}

export function collectLinkProperties(boq: BoqDoc): PropertyRef[] {
  const seen = new Map<string, PropertyRef>()
  const add = (ref: PropertyRef | null | undefined) => {
    if (!ref) return
    seen.set(propertyRefKey(ref), ref)
  }
  add(boq.linkProperty)
  const walk = (node: BoqNode) => {
    add(node.matchProperty)
    for (const child of node.children) walk(child)
  }
  for (const node of boq.root) walk(node)
  return [...seen.values()]
}

export function idsMatchingValue(labels: Map<number, string>, value: string): number[] {
  const needle = value.trim()
  if (!needle) return []
  const ids: number[] = []
  for (const [id, label] of labels) {
    if (labelMatchesValue(label, needle)) ids.push(id)
  }
  ids.sort((left, right) => left - right)
  return ids
}

export function labelMatchesValue(label: string | null | undefined, needle: string): boolean {
  if (!label || label === MISSING_VALUE) return false
  if (valueMatchesCode(label, needle)) return true
  return label.trim().toLowerCase() === needle.trim().toLowerCase()
}

export function bindImportedBoq(
  boq: BoqDoc,
  labelsByProperty: Map<string, Map<number, string>>,
): { boq: BoqDoc; mappedLines: number; mappedElements: number } {
  let mappedLines = 0
  let mappedElements = 0
  const bind = (nodes: BoqNode[]): BoqNode[] =>
    nodes.map((node) => {
      const children = bind(node.children)
      if (node.source !== 'import') return { ...node, children }
      const property = lineMatchProperty(node, boq.linkProperty)
      const value = lineMatchValue(node)
      let ids = node.ids
      if (property && value) {
        const labels = labelsByProperty.get(propertyRefKey(property))
        ids = labels ? idsMatchingValue(labels, value) : []
        if (ids.length > 0) {
          mappedLines += 1
          mappedElements += ids.length
        }
      } else if (children.length > 0) {
        ids = uniquePositiveIds(children.flatMap((child) => child.ids))
      }
      return { ...node, children, ids }
    })
  return {
    boq: { ...boq, root: bind(boq.root) },
    mappedLines,
    mappedElements,
  }
}
