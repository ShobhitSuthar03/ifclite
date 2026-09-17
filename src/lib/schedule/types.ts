import type { WorkCalendarInfo } from '@ifc-lite/parser'

export type ScheduleSource = 'ifc' | 'import'

export type ScheduleWarning = {
  code: string
  message: string
}

export type GanttSequence = {
  fromId: string
  toId: string
  type: 'FS' | 'SS' | 'FF' | 'SF'
  lagSeconds?: number
}

export type GanttTask = {
  id: string
  expressId?: number
  name: string
  outlineLevel: number
  start: Date | null
  finish: Date | null
  isMilestone: boolean
  completion?: number
  productExpressIds: number[]
  parentId?: string
  childIds: string[]
  cost?: number
  currency?: string
  calendarIds?: string[]
}

export type ResourceKind = 'labor' | 'material' | 'equipment' | 'other'

export type ResourceQty = {
  code: string
  kind: ResourceKind
  unit: string
  quantity: number
}

export type GanttModel = {
  source: ScheduleSource
  name: string
  tasks: GanttTask[]
  sequences: GanttSequence[]
  warnings: ScheduleWarning[]
  hasSchedule: boolean
  productResources?: Map<number, ResourceQty[]>
  calendars?: WorkCalendarInfo[]
}
