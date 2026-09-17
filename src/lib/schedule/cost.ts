import { EntityExtractor, type IfcDataStore, type WorkCalendarInfo } from '@ifc-lite/parser'
import { calendarForTask, countWorkingDays, isWorkingDay } from '@/lib/schedule/calendar'
import {
  addDays,
  bucketKey,
  enumerateBuckets,
  fromBucketKey,
  nextBucket,
  startOfDay,
  type ScheduleGrain,
} from '@/lib/schedule/dates'
import { histogramMonthIndex } from '@/lib/schedule/resource-load'
import type { GanttTask } from '@/lib/schedule/types'

/** Planned IfcCostItem USD, time-phased across each leaf task's ScheduleStart/Finish. */

export type TaskCostMap = {
  byExpressId: Map<number, number>
  byGlobalId: Map<string, number>
  currency: string
}

export type CostCurve = {
  months: number
  labels: string[]
  keys: string[]
  monthly: number[]
  cumulative: number[]
  total: number
  currency: string
}

const REL_ASSIGNS_TO_CONTROL = { RelatedObjects: 4, RelatingControl: 6 }
const COST_ITEM_COST_VALUES = 7
const COST_VALUE_APPLIED = 2

function asRef(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value
  return undefined
}

function asRefList(value: unknown): number[] {
  if (typeof value === 'number') {
    const single = asRef(value)
    return single != null ? [single] : []
  }
  if (!Array.isArray(value)) return []
  const ids: number[] = []
  for (const item of value) ids.push(...asRefList(item))
  return ids
}

function asMeasureNumber(value: unknown): number | undefined {
  if (Array.isArray(value) && value.length >= 2) {
    const inner = value[1]
    if (typeof inner === 'number' && Number.isFinite(inner)) return inner
    const parsed = Number.parseFloat(String(inner ?? ''))
    if (Number.isFinite(parsed)) return parsed
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    // Express IDs are integers; IFC money in this model is IFCREAL (or a small integer).
    if (Number.isInteger(value) && value >= 1_000_000) return undefined
    return value
  }
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value.replace(',', '.'))
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

function attrsUnitCode(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (Array.isArray(value) && typeof value[1] === 'string' && value[1].trim()) return value[1].trim()
  return undefined
}

function resolveEntityAmount(
  extractor: EntityExtractor,
  store: IfcDataStore,
  expressId: number,
  visiting: Set<number>,
): { amount: number; currency?: string } | null {
  if (visiting.has(expressId)) return null
  const ref = store.entityIndex.byId.get(expressId)
  if (!ref) return null
  const entity = extractor.extractEntity(ref)
  if (!entity) return null
  visiting.add(expressId)
  const type = entity.type.toUpperCase()
  const attrs = entity.attributes ?? []
  if (type === 'IFCMEASUREWITHUNIT') {
    const amount = asMeasureNumber(attrs[0])
    const unitRef = asRef(attrs[1])
    let currency: string | undefined
    if (unitRef != null) {
      const unitRefRec = store.entityIndex.byId.get(unitRef)
      const unit = unitRefRec ? extractor.extractEntity(unitRefRec) : null
      if (unit?.type.toUpperCase() === 'IFCMONETARYUNIT') {
        currency = attrsUnitCode(unit.attributes?.[0])
      }
    }
    visiting.delete(expressId)
    return amount != null && amount !== 0 ? { amount, currency } : null
  }
  if (type === 'IFCCOSTVALUE') {
    const resolved = resolveApplied(extractor, store, attrs[COST_VALUE_APPLIED], visiting)
    visiting.delete(expressId)
    return resolved
  }
  visiting.delete(expressId)
  return null
}

function resolveApplied(
  extractor: EntityExtractor,
  store: IfcDataStore,
  raw: unknown,
  visiting: Set<number>,
): { amount: number; currency?: string } | null {
  const ref = asRef(raw)
  if (ref != null) return resolveEntityAmount(extractor, store, ref, visiting)
  const amount = asMeasureNumber(raw)
  return amount != null && amount !== 0 ? { amount } : null
}

function costItemAmount(
  extractor: EntityExtractor,
  store: IfcDataStore,
  itemId: number,
): { amount: number; currency?: string } | null {
  const ref = store.entityIndex.byId.get(itemId)
  const entity = ref ? extractor.extractEntity(ref) : null
  if (!entity || entity.type.toUpperCase() !== 'IFCCOSTITEM') return null
  let amount = 0
  let currency: string | undefined
  const valueIds = asRefList(entity.attributes?.[COST_ITEM_COST_VALUES])
  const refs = valueIds.length > 0 ? valueIds : asRefList(entity.attributes?.[6])
  for (const valueId of refs) {
    const resolved = resolveEntityAmount(extractor, store, valueId, new Set())
    if (!resolved) continue
    amount += resolved.amount
    if (resolved.currency) currency = resolved.currency
  }
  return amount !== 0 ? { amount, currency } : null
}

export function extractTaskCosts(store: IfcDataStore): TaskCostMap {
  const empty: TaskCostMap = { byExpressId: new Map(), byGlobalId: new Map(), currency: 'USD' }
  if (!store.source?.length) return empty
  const itemIds = new Set(store.entityIndex.byType.get('IFCCOSTITEM') ?? [])
  const relIds = store.entityIndex.byType.get('IFCRELASSIGNSTOCONTROL') ?? []
  if (itemIds.size === 0 || relIds.length === 0) return empty
  const extractor = new EntityExtractor(store.source)
  const byExpressId = new Map<number, number>()
  const byGlobalId = new Map<string, number>()
  let currency = 'USD'
  for (const relId of relIds) {
    const ref = store.entityIndex.byId.get(relId)
    const entity = ref ? extractor.extractEntity(ref) : null
    if (!entity) continue
    const attrs = entity.attributes ?? []
    const controlId = asRef(attrs[REL_ASSIGNS_TO_CONTROL.RelatingControl])
    if (controlId == null || !itemIds.has(controlId)) continue
    const resolved = costItemAmount(extractor, store, controlId)
    if (!resolved) continue
    if (resolved.currency) currency = resolved.currency
    for (const objectId of asRefList(attrs[REL_ASSIGNS_TO_CONTROL.RelatedObjects])) {
      byExpressId.set(objectId, (byExpressId.get(objectId) ?? 0) + resolved.amount)
      const gid = store.entities?.getGlobalId?.(objectId)
      if (gid) byGlobalId.set(gid, (byGlobalId.get(gid) ?? 0) + resolved.amount)
    }
  }
  return { byExpressId, byGlobalId, currency }
}

export function applyTaskCosts(tasks: GanttTask[], costs: TaskCostMap): GanttTask[] {
  if (costs.byExpressId.size === 0 && costs.byGlobalId.size === 0) return tasks
  return tasks.map((task) => {
    const expressId = task.expressId != null ? Number(task.expressId) : undefined
    const amount =
      (expressId != null ? costs.byExpressId.get(expressId) : undefined) ?? costs.byGlobalId.get(task.id)
    if (amount == null) return task
    return { ...task, cost: amount, currency: costs.currency }
  })
}

function incrementalCost(task: GanttTask, byId: Map<string, GanttTask>): number {
  const own = task.cost ?? 0
  if (own <= 0) return 0
  let child = 0
  for (const id of task.childIds) child += byId.get(id)?.cost ?? 0
  return Math.max(0, own - child)
}

function windowOf(
  task: GanttTask,
  byId: Map<string, GanttTask>,
  seen: Set<string>,
): { start: Date; finish: Date } | null {
  const start = task.start
  const finish = task.finish ?? task.start
  if (start && finish) return { start, finish }
  if (!task.parentId || seen.has(task.id)) return null
  seen.add(task.id)
  const parent = byId.get(task.parentId)
  return parent ? windowOf(parent, byId, seen) : null
}

function addCostToBuckets(
  monthly: number[],
  indexOf: Map<string, number>,
  grain: ScheduleGrain,
  start: Date,
  finish: Date,
  cost: number,
  calendar: WorkCalendarInfo | undefined,
  fullStart: Date,
  fullFinish: Date,
) {
  const workDays = countWorkingDays(fullStart, fullFinish, calendar)
  if (workDays <= 0) {
    const bucket = indexOf.get(bucketKey(start, grain))
    if (bucket != null) monthly[bucket] += cost
    return
  }
  const perDay = cost / workDays
  const cursor = startOfDay(start)
  const endMs = finish.getTime() <= start.getTime() ? cursor.getTime() + 1 : finish.getTime()
  while (cursor.getTime() < endMs) {
    if (!calendar || isWorkingDay(cursor, calendar)) {
      const bucket = indexOf.get(bucketKey(cursor, grain))
      if (bucket != null) monthly[bucket] += perDay
    }
    cursor.setDate(cursor.getDate() + 1)
  }
}

export function costCurve(
  tasks: GanttTask[],
  range: { start: Date; finish: Date },
  grain: ScheduleGrain = 'month',
  calendars?: WorkCalendarInfo[],
): CostCurve | null {
  if (tasks.length === 0) return null
  const byId = new Map(tasks.map((task) => [task.id, task]))
  const windowStart = startOfDay(range.start)
  const lastDay = startOfDay(range.finish)
  if (lastDay.getTime() < windowStart.getTime()) return null
  const windowEnd = addDays(lastDay, 1)
  const buckets = enumerateBuckets(windowStart, lastDay, grain)
  const indexOf = new Map(buckets.map((date, index) => [bucketKey(date, grain), index]))
  const monthly = Array.from({ length: buckets.length }, () => 0)
  let currency = 'USD'

  for (const task of tasks) {
    const amount = incrementalCost(task, byId)
    if (amount <= 0) continue
    if (task.currency) currency = task.currency
    const span = windowOf(task, byId, new Set())
    if (!span) continue
    const calendar = calendarForTask(task, calendars)
    const start = new Date(Math.max(span.start.getTime(), windowStart.getTime()))
    const finish = new Date(Math.min((span.finish ?? span.start).getTime(), windowEnd.getTime()))
    if (finish.getTime() <= start.getTime()) {
      const bucket = indexOf.get(bucketKey(start, grain))
      if (bucket != null) monthly[bucket] += amount
      continue
    }
    addCostToBuckets(
      monthly,
      indexOf,
      grain,
      start,
      finish,
      amount,
      calendar,
      span.start,
      span.finish ?? span.start,
    )
  }

  const cumulative: number[] = []
  let running = 0
  for (const value of monthly) {
    running += value
    cumulative.push(running)
  }
  if (running <= 0) return null
  return {
    months: buckets.length,
    labels: buckets.map((date) =>
      grain === 'day'
        ? String(date.getDate())
        : date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' }),
    ),
    keys: buckets.map((date) => bucketKey(date, grain)),
    monthly,
    cumulative,
    total: running,
    currency,
  }
}

export function spentAt(curve: CostCurve, at: Date | null): number {
  if (!at || curve.keys.length === 0) return curve.total
  const index = histogramMonthIndex(curve.keys, at)
  const prev = index > 0 ? curve.cumulative[index - 1] : 0
  const start = fromBucketKey(curve.keys[index])
  if (!start) return prev
  const grain: ScheduleGrain = curve.keys[index].length > 7 ? 'day' : 'month'
  const end = nextBucket(start, grain)
  const span = Math.max(1, end.getTime() - start.getTime())
  const fraction = Math.min(1, Math.max(0, (at.getTime() - start.getTime()) / span))
  return prev + curve.monthly[index] * fraction
}

export function monthPlayheadPercent(keys: string[], at: Date): number {
  if (keys.length === 0) return 0
  const index = histogramMonthIndex(keys, at)
  const start = fromBucketKey(keys[index])
  if (!start) return 0
  const grain: ScheduleGrain = keys[index].length > 7 ? 'day' : 'month'
  const end = nextBucket(start, grain)
  const span = Math.max(1, end.getTime() - start.getTime())
  const fraction = Math.min(1, Math.max(0, (at.getTime() - start.getTime()) / span))
  return ((index + fraction) / keys.length) * 100
}

/** Bucket starts after the playhead date. */
export function isFutureMonth(monthKeyValue: string, at: Date): boolean {
  const start = fromBucketKey(monthKeyValue)
  if (!start) return false
  return start.getTime() > startOfDay(at).getTime()
}

export function formatScheduleMoney(value: number, currency = 'USD'): string {
  const abs = Math.abs(value)
  const code = currency || 'USD'
  if (abs >= 1_000_000) return `${code} ${(value / 1_000_000).toFixed(2)}M`
  if (abs >= 10_000) return `${code} ${(value / 1_000).toFixed(0)}k`
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: code,
      maximumFractionDigits: 0,
    }).format(value)
  } catch {
    return `${code} ${Math.round(value).toLocaleString()}`
  }
}
