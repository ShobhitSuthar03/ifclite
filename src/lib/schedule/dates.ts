/** IFC TaskTime often uses 7-digit fractional seconds; JS Date only keeps 3. */
export function parseScheduleDate(value?: string | null): Date | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  const iso = trimmed.replace(/(\.\d{3})\d+/, '$1')
  const parsed = new Date(iso)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function formatScheduleDay(value: Date): string {
  return value.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

export function daySpan(start: Date, finish: Date): number {
  return Math.max(1, Math.round((finish.getTime() - start.getTime()) / 86_400_000))
}

export function scheduleRange(tasks: Array<{ start: Date | null; finish: Date | null }>): {
  start: Date
  finish: Date
} | null {
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY
  for (const task of tasks) {
    if (task.start) min = Math.min(min, task.start.getTime())
    if (task.finish) max = Math.max(max, task.finish.getTime())
  }
  if (!Number.isFinite(min) || !Number.isFinite(max) || max < min) return null
  return { start: new Date(min), finish: new Date(max) }
}

export function barPercent(
  start: Date | null,
  finish: Date | null,
  rangeStart: Date,
  rangeEnd: Date,
): { left: number; width: number } | null {
  if (!start && !finish) return null
  const from = (start ?? finish)!.getTime()
  const to = (finish ?? start)!.getTime()
  const span = Math.max(1, rangeEnd.getTime() - rangeStart.getTime())
  const left = ((from - rangeStart.getTime()) / span) * 100
  const width = Math.max(0.4, ((to - from) / span) * 100)
  return { left: Math.max(0, left), width: Math.min(100 - Math.max(0, left), width) }
}

export function dateAtPercent(range: { start: Date; finish: Date }, percent: number): Date {
  const span = range.finish.getTime() - range.start.getTime()
  const clamped = Math.min(100, Math.max(0, percent))
  return new Date(range.start.getTime() + (span * clamped) / 100)
}

export function percentAtDate(range: { start: Date; finish: Date }, at: Date): number {
  const span = Math.max(1, range.finish.getTime() - range.start.getTime())
  return Math.min(100, Math.max(0, ((at.getTime() - range.start.getTime()) / span) * 100))
}

export function addDays(value: Date, days: number): Date {
  return new Date(value.getTime() + days * 86_400_000)
}

export function addMs(value: Date, ms: number): Date {
  return new Date(value.getTime() + ms)
}

export function toDateInput(value: Date): string {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function fromDateInput(value: string): Date | null {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return Number.isNaN(date.getTime()) ? null : date
}

export function startOfDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate())
}

export function startOfMonth(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), 1)
}

export function monthKey(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}`
}

export function dayKey(value: Date): string {
  return `${monthKey(value)}-${String(value.getDate()).padStart(2, '0')}`
}

export type ScheduleGrain = 'month' | 'day'

export function bucketKey(value: Date, grain: ScheduleGrain): string {
  return grain === 'day' ? dayKey(value) : monthKey(value)
}

export function fromBucketKey(key: string): Date | null {
  const match = key.trim().match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/)
  if (!match) return null
  const date = new Date(Number(match[1]), Number(match[2]) - 1, match[3] ? Number(match[3]) : 1)
  return Number.isNaN(date.getTime()) ? null : date
}

export function nextBucket(start: Date, grain: ScheduleGrain): Date {
  if (grain === 'day') return addDays(startOfDay(start), 1)
  return new Date(start.getFullYear(), start.getMonth() + 1, 1)
}

export function formatMonthLabel(value: Date): string {
  return value.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
}

export function enumerateMonths(from: Date, until: Date): Date[] {
  const months: Date[] = []
  const cursor = startOfMonth(from)
  const last = startOfMonth(until)
  while (cursor.getTime() <= last.getTime()) {
    months.push(new Date(cursor))
    cursor.setMonth(cursor.getMonth() + 1)
  }
  return months.length > 0 ? months : [startOfMonth(from)]
}

export function enumerateDays(from: Date, until: Date): Date[] {
  const days: Date[] = []
  const cursor = startOfDay(from)
  const last = startOfDay(until)
  while (cursor.getTime() <= last.getTime()) {
    days.push(new Date(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  return days.length > 0 ? days : [startOfDay(from)]
}

export function enumerateBuckets(from: Date, until: Date, grain: ScheduleGrain): Date[] {
  return grain === 'day' ? enumerateDays(from, until) : enumerateMonths(from, until)
}
