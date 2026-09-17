import { IfcTypeEnum, type SpatialTreeNode } from '@/lib/ifc-data'

/**
 * Compact model-shape summary for the agent's system prompt.
 *
 * The "Live desktop context" block already tells the agent about selection,
 * BOQ, and takeoff status, but says nothing about the model itself - element
 * types, how many of each, or its spatial structure. Without this the agent
 * starts every conversation blind to what kind of building it is even looking
 * at, and has to blindly guess-and-query its way to orientation instead of
 * being told upfront (the same reason a coding agent works better from a
 * repo/file-tree summary than from nothing).
 *
 * Derived entirely from the spatial tree already built for the Tree panel, not
 * a fresh warehouse query - it works the same whether the project came from a
 * live parse or a fast warehouse-only reopen.
 */
export function summarizeModelForAgent(fileName: string | null, spatialRoot: SpatialTreeNode | null): string {
  if (!spatialRoot) return 'Model: not loaded.'

  const typeCounts = new Map<string, number>()
  const storeyNames: string[] = []
  let totalElements = 0

  const walk = (node: SpatialTreeNode) => {
    if (node.type === IfcTypeEnum.IfcBuildingStorey) storeyNames.push(node.name)
    for (const group of node.elementGroups) {
      typeCounts.set(group.typeName, (typeCounts.get(group.typeName) ?? 0) + group.ids.length)
      totalElements += group.ids.length
    }
    for (const child of node.children) walk(child)
  }
  walk(spatialRoot)

  const rankedTypes = [...typeCounts.entries()].sort((a, b) => b[1] - a[1])
  const topTypes = rankedTypes
    .slice(0, 12)
    .map(([type, count]) => `${type} (${count})`)
    .join(', ')
  const remaining = rankedTypes.length - 12
  const typesLine = remaining > 0 ? `${topTypes}, +${remaining} more types` : topTypes || 'none found'

  const spatialLine =
    storeyNames.length > 0
      ? `${storeyNames.length} storey${storeyNames.length === 1 ? '' : 's'}: ${storeyNames.join(', ')}`
      : 'no storeys found in spatial tree'

  return [
    `Model: ${fileName ?? 'unnamed'} — ${totalElements.toLocaleString()} elements across ${typeCounts.size} IFC types.`,
    `Element types: ${typesLine}`,
    `Spatial structure: ${spatialLine}`,
  ].join('\n')
}
