import { fromDateInput, startOfDay } from '@/lib/schedule/dates'
import type { GanttTask } from '@/lib/schedule/types'
import type { WorkCalendarInfo, WorkTimeInfo } from '@ifc-lite/parser'

export type { WorkCalendarInfo }

function parseDay(value?: string): Date | null {
  if (!value) return null
  return fromDateInput(value.slice(0, 10))
}

/** IFC IfcDayInWeekNumber: 1=Monday … 7=Sunday. JS Date#getDay: 0=Sunday. */
export function ifcWeekday(date: Date): number {
  const js = date.getDay()
  return js === 0 ? 7 : js
}

function inRange(day: Date, time: WorkTimeInfo): boolean {
  const start = parseDay(time.start)
  const finish = parseDay(time.finish)
  const t = startOfDay(day).getTime()
  if (start && t < start.getTime()) return false
  if (finish && t > finish.getTime()) return false
  return true
}

function recurrenceHits(day: Date, time: WorkTimeInfo): boolean {
  const pattern = time.recurrencePattern
  if (!pattern) return true
  const type = (pattern.recurrenceType ?? 'DAILY').toUpperCase()
  if (type === 'WEEKLY') {
    const weekdays = pattern.weekdayComponent ?? []
    if (weekdays.length === 0) return true
    return weekdays.includes(ifcWeekday(day))
  }
  if (type === 'DAILY') return Boolean(time.start || time.finish)
  return true
}

function hasWorkingHours(time: WorkTimeInfo): boolean {
  const periods = time.recurrencePattern?.timePeriods ?? []
  if (periods.length === 0) return false
  return periods.some((period) => period.start !== period.end)
}

function timeHits(day: Date, time: WorkTimeInfo): boolean {
  return inRange(day, time) && recurrenceHits(day, time)
}

export function isWorkingDay(date: Date, calendar?: WorkCalendarInfo | null): boolean {
  if (!calendar) return true
  const day = startOfDay(date)
  for (const exception of calendar.exceptionTimes) {
    if (timeHits(day, exception)) return false
  }
  if (calendar.workingTimes.length === 0) return true
  return calendar.workingTimes.some((time) => timeHits(day, time) && hasWorkingHours(time))
}

export function calendarForTask(
  task: GanttTask,
  calendars: WorkCalendarInfo[] | undefined,
): WorkCalendarInfo | undefined {
  if (!calendars || calendars.length === 0) return undefined
  for (const id of task.calendarIds ?? []) {
    const match = calendars.find((calendar) => calendar.globalId === id)
    if (match) return match
  }
  return calendars[0]
}

export function countWorkingDays(
  start: Date,
  finish: Date,
  calendar?: WorkCalendarInfo | null,
): number {
  const cursor = startOfDay(start)
  const endMs = finish.getTime() <= start.getTime() ? cursor.getTime() + 1 : finish.getTime()
  let count = 0
  while (cursor.getTime() < endMs) {
    if (isWorkingDay(cursor, calendar)) count += 1
    cursor.setDate(cursor.getDate() + 1)
  }
  return count
}

export function nonWorkingKeys(
  keys: string[],
  calendar?: WorkCalendarInfo | null,
): Set<string> {
  const off = new Set<string>()
  if (!calendar) return off
  for (const key of keys) {
    if (key.length <= 7) continue
    const date = fromDateInput(key)
    if (date && !isWorkingDay(date, calendar)) off.add(key)
  }
  return off
}
