import { extractScheduleOnDemand, type IfcDataStore, type ScheduleExtraction } from '@ifc-lite/parser'
import { applyTaskCosts, extractTaskCosts } from '@/lib/schedule/cost'
import { parseScheduleDate } from '@/lib/schedule/dates'
import { extractProductResources } from '@/lib/schedule/resource-load'
import type { GanttModel, GanttSequence, GanttTask } from '@/lib/schedule/types'

function sequenceCode(type: string): GanttSequence['type'] {
  if (type === 'START_START') return 'SS'
  if (type === 'START_FINISH') return 'SF'
  if (type === 'FINISH_FINISH') return 'FF'
  return 'FS'
}

function outlineDepth(
  id: string,
  parentOf: Map<string, string | undefined>,
  memo: Map<string, number>,
): number {
  const cached = memo.get(id)
  if (cached != null) return cached
  const parent = parentOf.get(id)
  if (!parent) {
    memo.set(id, 0)
    return 0
  }
  memo.set(id, -1)
  const depth = 1 + outlineDepth(parent, parentOf, memo)
  memo.set(id, depth)
  return depth
}

export function ganttFromExtraction(extraction: ScheduleExtraction, name = 'IFC schedule'): GanttModel {
  const parentOf = new Map<string, string | undefined>()
  for (const task of extraction.tasks) parentOf.set(task.globalId, task.parentGlobalId)
  const depthMemo = new Map<string, number>()
  const byId = new Map(extraction.tasks.map((task) => [task.globalId, task]))
  const ordered: GanttTask[] = []
  const visit = (id: string) => {
    const task = byId.get(id)
    if (!task) return
    ordered.push({
      id: task.globalId,
      expressId: task.expressId,
      name: task.name || task.identification || `Task #${task.expressId}`,
      outlineLevel: outlineDepth(task.globalId, parentOf, depthMemo),
      start: parseScheduleDate(task.taskTime?.scheduleStart),
      finish: parseScheduleDate(task.taskTime?.scheduleFinish),
      isMilestone: task.isMilestone,
      completion: task.taskTime?.completion,
      productExpressIds: task.productExpressIds,
      parentId: task.parentGlobalId,
      childIds: [...task.childGlobalIds],
      calendarIds: task.calendarGlobalIds?.length ? [...task.calendarGlobalIds] : undefined,
    })
    for (const child of task.childGlobalIds) visit(child)
  }
  for (const task of extraction.tasks) {
    if (!task.parentGlobalId) visit(task.globalId)
  }
  const seen = new Set(ordered.map((task) => task.id))
  for (const task of extraction.tasks) {
    if (!seen.has(task.globalId)) visit(task.globalId)
  }
  const scheduleName = extraction.workSchedules[0]?.name || extraction.workSchedules[1]?.name || name
  return {
    source: 'ifc',
    name: scheduleName,
    tasks: ordered,
    sequences: extraction.sequences.map((seq) => ({
      fromId: seq.relatingTaskGlobalId,
      toId: seq.relatedTaskGlobalId,
      type: sequenceCode(seq.sequenceType),
      lagSeconds: seq.timeLagSeconds,
    })),
    warnings: [],
    hasSchedule: extraction.hasSchedule || ordered.length > 0,
    calendars: extraction.workCalendars ?? [],
  }
}

export function extractGanttFromStore(store: IfcDataStore): GanttModel {
  const gantt = ganttFromExtraction(extractScheduleOnDemand(store))
  const ids = gantt.tasks.flatMap((task) => task.productExpressIds)
  gantt.productResources = extractProductResources(store, ids)
  gantt.tasks = applyTaskCosts(gantt.tasks, extractTaskCosts(store))
  return gantt
}
