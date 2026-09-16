import { IfcTypeEnum, type SpatialTreeNode } from '@/lib/ifc-data'
import { exactValueLabel, nestByValues, type PropertyTreeNode } from '@/lib/property-tree'

/** Tree built from GPU meshes so Structure works before the IFC property parse. */
export function typeTreeFromMeshes(
  meshes: Array<{ expressId: number; ifcType?: string }>,
  fileName: string,
): SpatialTreeNode {
  const typeMap = new Map<string, number[]>()
  const seen = new Set<number>()
  for (const mesh of meshes) {
    if (seen.has(mesh.expressId)) continue
    seen.add(mesh.expressId)
    const typeName = mesh.ifcType || 'IfcProduct'
    const list = typeMap.get(typeName)
    if (list) list.push(mesh.expressId)
    else typeMap.set(typeName, [mesh.expressId])
  }
  const elementGroups = [...typeMap.entries()]
    .sort((left, right) => right[1].length - left[1].length || left[0].localeCompare(right[0]))
    .map(([typeName, ids]) => ({ typeName, ids }))
  return {
    expressId: 0,
    name: fileName.replace(/\.ifc$/i, '') || 'Model',
    type: IfcTypeEnum.IfcProject,
    children: [],
    elementGroups,
    totalElements: seen.size,
  }
}

export function isGeometryFallbackTree(node: SpatialTreeNode | null): boolean {
  return node != null && node.expressId === 0 && node.children.length === 0
}

/** Unique IFC types from meshes already on the GPU — no STEP parse. */
export function uniqueIfcTypeTree(meshes: Array<{ expressId: number; ifcType?: string }>): PropertyTreeNode[] {
  const ids: number[] = []
  const labels = new Map<number, string>()
  const seen = new Set<number>()
  for (const mesh of meshes) {
    if (seen.has(mesh.expressId)) continue
    seen.add(mesh.expressId)
    ids.push(mesh.expressId)
    labels.set(mesh.expressId, exactValueLabel(mesh.ifcType || 'IfcProduct', null))
  }
  return nestByValues(ids, [labels])
}
