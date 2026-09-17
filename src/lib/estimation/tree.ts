import type { PropertyRef, PropertyTreeNode } from '@/lib/property-tree'
import { uniquePositiveIds } from '@/lib/saved-views'
import type { BoqNode } from '@/lib/estimation/types'

export function propertyBoqId(key: string): string {
  return `p:${key}`
}

export function newManualBoqId(): string {
  return `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function createManualItem(name: string, ids: Iterable<number>): BoqNode | null {
  const unique = uniquePositiveIds(ids)
  const trimmed = name.trim()
  if (!trimmed || unique.length === 0) return null
  return {
    id: newManualBoqId(),
    name: trimmed,
    kind: 'item',
    source: 'manual',
    ids: unique,
    assemblyId: null,
    code: null,
    assemblyCode: null,
    qtyTakeoff: null,
    matchProperty: null,
    matchValue: null,
    children: [],
  }
}

export function createManualHeading(name: string): BoqNode | null {
  const trimmed = name.trim()
  if (!trimmed) return null
  return {
    id: newManualBoqId(),
    name: trimmed,
    kind: 'heading',
    source: 'manual',
    ids: [],
    assemblyId: null,
    code: null,
    assemblyCode: null,
    qtyTakeoff: null,
    matchProperty: null,
    matchValue: null,
    children: [],
  }
}

export function collectAssignments(nodes: BoqNode[]): Map<string, string | null> {
  const map = new Map<string, string | null>()
  const walk = (node: BoqNode) => {
    map.set(node.id, node.assemblyId)
    for (const child of node.children) walk(child)
  }
  for (const node of nodes) walk(node)
  return map
}

export function boqFromPropertyTree(
  nodes: PropertyTreeNode[],
  previous: Map<string, string | null> = new Map(),
): BoqNode[] {
  return nodes.map((node) => {
    const id = propertyBoqId(node.key)
    const children = boqFromPropertyTree(node.children, previous)
    return {
      id,
      name: node.label,
      kind: children.length > 0 ? 'heading' : 'item',
      source: 'property',
      ids: [...node.ids],
      assemblyId: previous.get(id) ?? null,
      code: null,
      assemblyCode: null,
      qtyTakeoff: null,
      matchProperty: null,
      matchValue: null,
      children,
    }
  })
}

export function takeManualForest(nodes: BoqNode[]): BoqNode[] {
  const out: BoqNode[] = []
  for (const node of nodes) {
    if (node.source !== 'property') out.push(node)
    else out.push(...takeManualForest(node.children))
  }
  return out
}

export function rebuildBoq(preview: PropertyTreeNode[], current: BoqNode[]): BoqNode[] {
  const assignments = collectAssignments(current)
  return [...boqFromPropertyTree(preview, assignments), ...takeManualForest(current)]
}

export function findBoqNode(nodes: BoqNode[], id: string | null | undefined): BoqNode | null {
  if (!id) return null
  for (const node of nodes) {
    if (node.id === id) return node
    const nested = findBoqNode(node.children, id)
    if (nested) return nested
  }
  return null
}

export function setNodeMatch(
  nodes: BoqNode[],
  nodeId: string,
  patch: { matchProperty?: PropertyRef | null; matchValue?: string | null },
): BoqNode[] {
  return nodes.map((node) => {
    if (node.id === nodeId) {
      return {
        ...node,
        matchProperty: patch.matchProperty !== undefined ? patch.matchProperty : node.matchProperty,
        matchValue: patch.matchValue !== undefined ? (patch.matchValue?.trim() ? patch.matchValue.trim() : null) : node.matchValue,
      }
    }
    if (node.children.length === 0) return node
    return { ...node, children: setNodeMatch(node.children, nodeId, patch) }
  })
}

export function setNodeAssembly(nodes: BoqNode[], nodeId: string, assemblyId: string | null): BoqNode[] {
  return nodes.map((node) => {
    if (node.id === nodeId) return { ...node, assemblyId }
    if (node.children.length === 0) return node
    return { ...node, children: setNodeAssembly(node.children, nodeId, assemblyId) }
  })
}

export function removeBoqNode(nodes: BoqNode[], nodeId: string): BoqNode[] {
  return nodes
    .filter((node) => node.id !== nodeId)
    .map((node) => ({ ...node, children: removeBoqNode(node.children, nodeId) }))
}

export function addChildNode(nodes: BoqNode[], parentId: string | null, child: BoqNode): BoqNode[] {
  if (!parentId) return [...nodes, child]
  return nodes.map((node) => {
    if (node.id !== parentId) return { ...node, children: addChildNode(node.children, parentId, child) }
    return {
      ...node,
      kind: 'heading',
      children: [...node.children, child],
    }
  })
}

export function renameBoqNode(nodes: BoqNode[], nodeId: string, name: string): BoqNode[] {
  const trimmed = name.trim()
  if (!trimmed) return nodes
  return nodes.map((node) => {
    if (node.id === nodeId) return node.source !== 'property' ? { ...node, name: trimmed } : node
    return { ...node, children: renameBoqNode(node.children, nodeId, trimmed) }
  })
}

export function flattenBoq(nodes: BoqNode[]): BoqNode[] {
  const out: BoqNode[] = []
  const walk = (node: BoqNode) => {
    out.push(node)
    for (const child of node.children) walk(child)
  }
  for (const node of nodes) walk(node)
  return out
}

export function findBoqLeafForElement(nodes: BoqNode[], expressId: number): BoqNode | null {
  const leaves = flattenBoq(nodes).filter((node) => node.children.length === 0 && node.ids.includes(expressId))
  return leaves.find((node) => node.assemblyId) ?? leaves[0] ?? null
}

export function rollupAmount(node: BoqNode, amountOf: (node: BoqNode) => number): number {
  if (node.assemblyId) return amountOf(node)
  return node.children.reduce((sum, child) => sum + rollupAmount(child, amountOf), 0)
}

export function defaultManualName(root: BoqNode[], kind: 'heading' | 'item'): string {
  const prefix = kind === 'heading' ? 'Heading' : 'Item'
  const count = flattenBoq(root).filter((node) => node.source !== 'property' && node.kind === kind).length
  return `${prefix} ${count + 1}`
}
