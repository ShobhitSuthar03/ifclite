import { namedActivity } from '@/lib/schedule/activity-color'
import type { GanttTask } from '@/lib/schedule/types'

export type ProductWindow = {
  start: Date
  finish: Date
  appearAt: Date
  activity: string
}

export type SimSnapshot = {
  planned: Set<number>
  active: Set<number>
  done: Set<number>
  unassigned: Set<number>
  activityOf: Map<number, string>
}

function datedWindow(
  task: GanttTask,
  byId: Map<string, GanttTask>,
  seen: Set<string>,
): { start: Date; finish: Date } | null {
  const start = task.start
  const finish = task.finish ?? task.start
  if (start && finish) return { start, finish }
  const parentId = task.parentId
  if (!parentId || seen.has(task.id)) return null
  seen.add(task.id)
  const parent = byId.get(parentId)
  return parent ? datedWindow(parent, byId, seen) : null
}

export function activityOf(task: GanttTask, byId: Map<string, GanttTask>): string {
  let current: GanttTask | undefined = task
  const seen = new Set<string>()
  while (current && !seen.has(current.id)) {
    seen.add(current.id)
    const named = namedActivity(current.name)
    if (named) return named
    current = current.parentId ? byId.get(current.parentId) : undefined
  }
  return namedActivity(task.name) ?? (task.name.trim() || 'Activity')
}

/** Earliest start / latest finish per product from tasks that name it. */
export function productWindows(tasks: GanttTask[]): Map<number, ProductWindow> {
  const byId = new Map(tasks.map((task) => [task.id, task]))
  const windows = new Map<number, ProductWindow>()
  for (const task of tasks) {
    if (task.productExpressIds.length === 0) continue
    const span = datedWindow(task, byId, new Set())
    if (!span) continue
    const activity = activityOf(task, byId)
    const ids = task.productExpressIds
    const duration = Math.max(0, span.finish.getTime() - span.start.getTime())
    const count = ids.length
    for (let i = 0; i < count; i += 1) {
      const appearAt = new Date(span.start.getTime() + (count <= 1 ? 0 : (duration * i) / count))
      const current = windows.get(ids[i])
      if (!current) {
        windows.set(ids[i], { start: span.start, finish: span.finish, appearAt, activity })
        continue
      }
      if (span.start < current.start) current.start = span.start
      if (span.finish > current.finish) current.finish = span.finish
      if (appearAt < current.appearAt) {
        current.appearAt = appearAt
        current.activity = activity
      }
    }
  }
  return windows
}

export function simulateAt(
  windows: Map<number, ProductWindow>,
  allIds: Iterable<number>,
  at: Date,
): SimSnapshot {
  const t = at.getTime()
  const planned = new Set<number>()
  const active = new Set<number>()
  const done = new Set<number>()
  const activityOfProduct = new Map<number, string>()
  const assigned = new Set(windows.keys())
  for (const [id, window] of windows) {
    activityOfProduct.set(id, window.activity)
    if (t < window.appearAt.getTime()) planned.add(id)
    else if (t >= window.finish.getTime()) done.add(id)
    else active.add(id)
  }
  const unassigned = new Set<number>()
  for (const id of allIds) {
    if (!assigned.has(id)) unassigned.add(id)
  }
  return { planned, active, done, unassigned, activityOf: activityOfProduct }
}
