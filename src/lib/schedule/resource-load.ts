import { extractPropertiesOnDemand, type IfcDataStore } from '@ifc-lite/parser'
import { activityCss } from '@/lib/schedule/activity-color'
import { calendarForTask, countWorkingDays, isWorkingDay } from '@/lib/schedule/calendar'
import {
  addDays,
  bucketKey,
  dayKey,
  daySpan,
  enumerateBuckets,
  startOfDay,
  type ScheduleGrain,
} from '@/lib/schedule/dates'
import type { GanttTask, ResourceKind, ResourceQty } from '@/lib/schedule/types'
import type { WorkCalendarInfo } from '@ifc-lite/parser'

const VALUE_RE = /^(-?\d+(?:[.,]\d+)?)\s*([A-Za-z]+)?/

export function kindFromCode(code: string): ResourceKind {
  const prefix = code.trim().slice(0, 2).toUpperCase()
  if (prefix === 'LO') return 'labor'
  if (prefix === 'MA') return 'material'
  if (prefix === 'ME') return 'equipment'
  return 'other'
}

export function parseResourceValue(raw: string): { quantity: number; unit: string } | null {
  const match = raw.trim().match(VALUE_RE)
  if (!match) return null
  const quantity = Number(match[1].replace(',', '.'))
  if (!Number.isFinite(quantity) || quantity === 0) return null
  return { quantity, unit: (match[2] ?? '').toLowerCase() }
}

function propertyText(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') return String(value)
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    if ('value' in record) return propertyText(record.value)
    if ('wrappedValue' in record) return propertyText(record.wrappedValue)
  }
  return String(value)
}

export function parseResourcePset(
  psets: Array<{ name: string; properties: Array<{ name: string; value: unknown }> }>,
): ResourceQty[] {
  const items: ResourceQty[] = []
  for (const pset of psets) {
    if (!/resource\s*data/i.test(pset.name)) continue
    for (const property of pset.properties) {
      const parsed = parseResourceValue(propertyText(property.value))
      if (!parsed) continue
      items.push({
        code: property.name,
        kind: kindFromCode(property.name),
        unit: parsed.unit,
        quantity: parsed.quantity,
      })
    }
  }
  return items
}

export function extractProductResources(
  store: IfcDataStore,
  expressIds: Iterable<number>,
): Map<number, ResourceQty[]> {
  const resources = new Map<number, ResourceQty[]>()
  const seen = new Set<number>()
  for (const id of expressIds) {
    if (seen.has(id)) continue
    seen.add(id)
    const items = parseResourcePset(extractPropertiesOnDemand(store, id))
    if (items.length > 0) resources.set(id, items)
  }
  return resources
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

export type ResourceSeries = {
  code: string
  color: string
  values: number[]
}

export type ResourceHistogram = {
  months: number
  labels: string[]
  keys: string[]
  peak: number
  series: ResourceSeries[]
  totals: number[]
  consumed: number
  unit: string
  crewAvg: number[]
  crewPeak: number[]
  avgCrew: number
  peakCrew: number
  hoursPerDay: number
  grain: ScheduleGrain
}

export const CREW_HOURS_PER_DAY = 8

function clipWindow(
  span: { start: Date; finish: Date },
  window: { start: Date; finish: Date },
): { start: Date; finish: Date } | null {
  const start = new Date(Math.max(span.start.getTime(), window.start.getTime()))
  const finish = new Date(Math.min(span.finish.getTime(), window.finish.getTime()))
  if (finish.getTime() <= start.getTime()) return null
  return { start, finish }
}

const TOP_CODES = 5

export function resourceHistogram(
  tasks: GanttTask[],
  productResources: Map<number, ResourceQty[]>,
  range: { start: Date; finish: Date },
  kind: ResourceKind | 'all',
  hoursPerDay = CREW_HOURS_PER_DAY,
  grain: ScheduleGrain = 'month',
  calendars?: WorkCalendarInfo[],
): ResourceHistogram | null {
  if (productResources.size === 0) return null
  const windowStart = startOfDay(range.start)
  const lastDay = startOfDay(range.finish)
  if (lastDay.getTime() < windowStart.getTime()) return null
  const windowEnd = addDays(lastDay, 1)
  const buckets = enumerateBuckets(windowStart, lastDay, grain)
  const indexOf = new Map(buckets.map((date, index) => [bucketKey(date, grain), index]))
  const byCode = new Map<string, number[]>()
  const byId = new Map(tasks.map((task) => [task.id, task]))
  const assigned = new Set<number>()
  const empty = () => Array.from({ length: buckets.length }, () => 0)
  const dailyLabor = new Map<string, number>()

  for (const task of tasks) {
    if (task.productExpressIds.length === 0) continue
    const span = windowOf(task, byId, new Set())
    if (!span) continue
    const overlap = clipWindow(span, { start: windowStart, finish: windowEnd })
    if (!overlap) continue
    const calendar = calendarForTask(task, calendars)
    const taskDays = calendar
      ? countWorkingDays(span.start, span.finish, calendar)
      : Math.max(1, daySpan(span.start, span.finish))
    if (taskDays <= 0) continue
    for (const id of task.productExpressIds) {
      if (assigned.has(id)) continue
      assigned.add(id)
      const items = productResources.get(id)
      if (!items) continue
      for (const item of items) {
        const perDay = item.quantity / taskDays
        const cursor = startOfDay(overlap.start)
        while (cursor.getTime() < overlap.finish.getTime()) {
          if (calendar && !isWorkingDay(cursor, calendar)) {
            cursor.setDate(cursor.getDate() + 1)
            continue
          }
          const bucket = indexOf.get(bucketKey(cursor, grain))
          if (item.kind === 'labor' && bucket != null) {
            const key = dayKey(cursor)
            dailyLabor.set(key, (dailyLabor.get(key) ?? 0) + perDay)
          }
          if ((kind === 'all' || item.kind === kind) && bucket != null) {
            let values = byCode.get(item.code)
            if (!values) {
              values = empty()
              byCode.set(item.code, values)
            }
            values[bucket] += perDay
          }
          cursor.setDate(cursor.getDate() + 1)
        }
      }
    }
  }

  if (byCode.size === 0) return null
  const ranked = [...byCode.entries()].sort((left, right) => {
    const sum = (values: number[]) => values.reduce((total, value) => total + value, 0)
    return sum(right[1]) - sum(left[1])
  })
  const top = ranked.slice(0, TOP_CODES)
  const rest = ranked.slice(TOP_CODES)
  const series: ResourceSeries[] = top.map(([code, values]) => ({
    code,
    color: activityCss(code),
    values,
  }))
  if (rest.length > 0) {
    const values = empty()
    for (const [, row] of rest) {
    for (let i = 0; i < buckets.length; i += 1) values[i] += row[i]
    }
    series.push({ code: 'Other', color: '#94a3b8', values })
  }
  const totals = Array.from({ length: buckets.length }, (_, index) =>
    series.reduce((sum, item) => sum + item.values[index], 0),
  )
  const consumed = totals.reduce((sum, value) => sum + value, 0)
  const peak = Math.max(0.001, ...totals)
  const crewAvg = empty()
  const crewPeak = empty()
  const laborDays = empty()
  const laborHours = empty()
  const laborPeakDay = empty()
  const shift = Math.max(1, hoursPerDay)
  for (const [key, hours] of dailyLabor) {
    const [year, month, day] = key.split('-').map(Number)
    const date = new Date(year, month - 1, day)
    const bucket = indexOf.get(bucketKey(date, grain))
    if (bucket == null) continue
    laborHours[bucket] += hours
    laborDays[bucket] += 1
    if (hours > laborPeakDay[bucket]) laborPeakDay[bucket] = hours
  }
  for (let i = 0; i < buckets.length; i += 1) {
    crewAvg[i] = laborDays[i] > 0 ? laborHours[i] / (shift * laborDays[i]) : 0
    crewPeak[i] = laborPeakDay[i] / shift
  }
  const laborDayCount = dailyLabor.size
  const laborTotal = [...dailyLabor.values()].reduce((sum, value) => sum + value, 0)
  const avgCrew = laborDayCount > 0 ? laborTotal / (shift * laborDayCount) : 0
  const peakCrew = laborPeakDay.reduce((max, value) => Math.max(max, value / shift), 0)
  return {
    months: buckets.length,
    labels: buckets.map((date) =>
      grain === 'day'
        ? String(date.getDate())
        : date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' }),
    ),
    keys: buckets.map((date) => bucketKey(date, grain)),
    peak,
    series,
    totals,
    consumed,
    unit: kind === 'labor' ? 'h' : 'qty',
    crewAvg,
    crewPeak,
    avgCrew,
    peakCrew,
    hoursPerDay: shift,
    grain,
  }
}

export function histogramMonthIndex(keys: string[], at: Date): number {
  if (keys.length === 0) return 0
  const grain: ScheduleGrain = keys[0].length > 7 ? 'day' : 'month'
  const key = bucketKey(at, grain)
  const index = keys.indexOf(key)
  if (index >= 0) return index
  if (key < (keys[0] ?? '')) return 0
  return Math.max(0, keys.length - 1)
}

export type CrewPeriod = {
  id: string
  from: Date
  until: Date
  crew: number
}

export function monthOverlapsPeriod(monthKeyValue: string, from: Date, until: Date): boolean {
  const [year, month] = monthKeyValue.split('-').map(Number)
  if (!year || !month) return false
  const start = new Date(year, month - 1, 1)
  const end = new Date(year, month, 1)
  const periodStart = startOfDay(from)
  const periodEnd = addDays(startOfDay(until), 1)
  return periodStart.getTime() < end.getTime() && periodEnd.getTime() > start.getTime()
}

/** Highest user-defined crew covering each month. */
export function plannedCrewByMonth(keys: string[], periods: CrewPeriod[]): number[] {
  return keys.map((key) => {
    let max = 0
    for (const period of periods) {
      if (period.crew <= 0) continue
      if (monthOverlapsPeriod(key, period.from, period.until)) max = Math.max(max, period.crew)
    }
    return max
  })
}
