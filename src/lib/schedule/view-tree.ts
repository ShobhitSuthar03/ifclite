import type { GanttTask } from '@/lib/schedule/types'

export type ScheduleGroupMode = 'wbs' | number

export function outlineLevels(tasks: GanttTask[]): number[] {
  const levels = new Set<number>()
  for (const task of tasks) {
    if (task.outlineLevel > 0) levels.add(task.outlineLevel)
  }
  return [...levels].sort((left, right) => left - right)
}

export function linkOutlineChildren(tasks: GanttTask[]): GanttTask[] {
  for (const task of tasks) {
    task.childIds = []
    task.parentId = undefined
  }
  const stack: GanttTask[] = []
  for (const task of tasks) {
    while (stack.length > 0 && stack[stack.length - 1].outlineLevel >= task.outlineLevel) stack.pop()
    const parent = stack.at(-1)
    if (parent) {
      task.parentId = parent.id
      parent.childIds.push(task.id)
    }
    stack.push(task)
  }
  return tasks
}

function byId(tasks: GanttTask[]): Map<string, GanttTask> {
  return new Map(tasks.map((task) => [task.id, task]))
}

function ancestorPath(task: GanttTask, index: Map<string, GanttTask>): GanttTask[] {
  const path: GanttTask[] = []
  let current: GanttTask | undefined = task
  const seen = new Set<string>()
  while (current && !seen.has(current.id)) {
    seen.add(current.id)
    path.unshift(current)
    current = current.parentId ? index.get(current.parentId) : undefined
  }
  return path
}

function mergeSpan(into: GanttTask, from: GanttTask) {
  if (from.start && (!into.start || from.start < into.start)) into.start = from.start
  if (from.finish && (!into.finish || from.finish > into.finish)) into.finish = from.finish
  const products = new Set(into.productExpressIds)
  for (const id of from.productExpressIds) products.add(id)
  into.productExpressIds = [...products]
}

function treeFromPaths(paths: GanttTask[][], key: string): GanttTask[] {
  type Node = GanttTask & { kids: Map<string, Node> }
  const roots = new Map<string, Node>()

  const ensure = (bucket: Map<string, Node>, id: string, source: GanttTask, depth: number, leaf: boolean): Node => {
    let node = bucket.get(id)
    if (!node) {
      node = {
        ...source,
        id: leaf ? source.id : `view:${key}:${id}`,
        expressId: leaf ? source.expressId : undefined,
        name: source.name,
        outlineLevel: depth,
        parentId: undefined,
        childIds: [],
        productExpressIds: [...source.productExpressIds],
        kids: new Map(),
      }
      bucket.set(id, node)
    } else {
      mergeSpan(node, source)
    }
    return node
  }

  for (const path of paths) {
    if (path.length === 0) continue
    let bucket = roots
    let prefix = ''
    let parent: Node | undefined
    path.forEach((step, index) => {
      prefix = prefix ? `${prefix}\0${step.name}` : step.name
      const leaf = index === path.length - 1
      const node = ensure(bucket, prefix, step, index, leaf)
      if (parent) {
        node.parentId = parent.id
        if (!parent.childIds.includes(node.id)) parent.childIds.push(node.id)
      }
      parent = node
      bucket = node.kids
    })
  }

  const ordered: GanttTask[] = []
  const walk = (node: Node) => {
    ordered.push({
      id: node.id,
      expressId: node.expressId,
      name: node.name,
      outlineLevel: node.outlineLevel,
      start: node.start,
      finish: node.finish,
      isMilestone: node.isMilestone,
      completion: node.completion,
      productExpressIds: node.productExpressIds,
      parentId: node.parentId,
      childIds: node.childIds,
      cost: node.cost,
      currency: node.currency,
    })
    for (const child of node.kids.values()) walk(child)
  }
  for (const node of roots.values()) walk(node)
  return ordered
}

/** Pivot the tree so tasks at `pivotLevel` become the roots. */
export function groupedScheduleTasks(tasks: GanttTask[], mode: ScheduleGroupMode): GanttTask[] {
  if (mode === 'wbs' || tasks.length === 0) return tasks
  const index = byId(tasks)
  const leaves = tasks.filter((task) => task.childIds.length === 0)
  const paths: GanttTask[][] = []
  for (const leaf of leaves) {
    const full = ancestorPath(leaf, index)
    const pivot = full.findIndex((task) => task.outlineLevel === mode)
    if (pivot < 0) paths.push([{ ...leaf, name: 'Unassigned', childIds: [] }, ...full])
    else paths.push([full[pivot], ...full.filter((_, index) => index !== pivot)])
  }
  return treeFromPaths(paths, `l${mode}`)
}

export function visibleScheduleTasks(tasks: GanttTask[], expanded: Set<string>): GanttTask[] {
  const index = byId(tasks)
  return tasks.filter((task) => {
    let parentId = task.parentId
    const seen = new Set<string>()
    while (parentId && !seen.has(parentId)) {
      seen.add(parentId)
      if (!expanded.has(parentId)) return false
      parentId = index.get(parentId)?.parentId
    }
    return true
  })
}

export function defaultExpandedIds(tasks: GanttTask[], depth = 1): Set<string> {
  return new Set(tasks.filter((task) => task.outlineLevel < depth && task.childIds.length > 0).map((task) => task.id))
}

export function parentIdsWithChildren(tasks: GanttTask[]): string[] {
  return tasks.filter((task) => task.childIds.length > 0).map((task) => task.id)
}
