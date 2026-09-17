import { describe, expect, it } from 'vitest'
import { namedActivity } from '@/lib/schedule/activity-color'
import { ifcWeekday, isWorkingDay, nonWorkingKeys } from '@/lib/schedule/calendar'
import { costCurve, isFutureMonth, monthPlayheadPercent, spentAt } from '@/lib/schedule/cost'
import { barPercent, parseScheduleDate, scheduleRange } from '@/lib/schedule/dates'
import { ganttFromExtraction } from '@/lib/schedule/from-ifc'
import { parsePredecessorToken, parseScheduleCsv } from '@/lib/schedule/import-csv'
import { kindFromCode, parseResourceValue, plannedCrewByMonth, resourceHistogram } from '@/lib/schedule/resource-load'
import { productWindows, simulateAt } from '@/lib/schedule/simulate'
import type { GanttTask } from '@/lib/schedule/types'
import { groupedScheduleTasks, outlineLevels, visibleScheduleTasks } from '@/lib/schedule/view-tree'
import type { ScheduleExtraction, WorkCalendarInfo } from '@ifc-lite/parser'

describe('parseScheduleDate', () => {
  it('keeps IFC TaskTime fractional seconds', () => {
    const parsed = parseScheduleDate('2026-03-26T06:00:00.0000000')
    expect(parsed?.getUTCFullYear()).toBe(2026)
    expect(parsed?.getUTCMonth()).toBe(2)
    expect(parsed?.getUTCDate()).toBe(26)
  })
})

describe('ganttFromExtraction', () => {
  it('nests Blok A children and keeps product links', () => {
    const extraction = {
      hasSchedule: true,
      workSchedules: [{ globalId: 's', name: '20260326', kind: 'WorkSchedule', taskGlobalIds: [] }],
      sequences: [
        {
          globalId: 'seq',
          relatingTaskGlobalId: '9a',
          relatedTaskGlobalId: '9b',
          sequenceType: 'FINISH_START',
        },
      ],
      tasks: [
        {
          expressId: 1,
          globalId: 'root',
          name: 'V07',
          isMilestone: false,
          childGlobalIds: ['blok'],
          productExpressIds: [],
          productGlobalIds: [],
          controllingScheduleGlobalIds: [],
        },
        {
          expressId: 2,
          globalId: 'blok',
          name: 'Blok A',
          parentGlobalId: 'root',
          isMilestone: false,
          childGlobalIds: ['9b', '9a'],
          productExpressIds: [],
          productGlobalIds: [],
          controllingScheduleGlobalIds: [],
        },
        {
          expressId: 3,
          globalId: '9b',
          name: '9B',
          parentGlobalId: 'blok',
          isMilestone: false,
          childGlobalIds: [],
          productExpressIds: [10, 11],
          productGlobalIds: ['g10', 'g11'],
          controllingScheduleGlobalIds: [],
          calendarGlobalIds: ['cal'],
          taskTime: { scheduleStart: '2026-03-26T06:00:00', scheduleFinish: '2026-05-20T12:00:00' },
        },
        {
          expressId: 4,
          globalId: '9a',
          name: '9A',
          parentGlobalId: 'blok',
          isMilestone: false,
          childGlobalIds: [],
          productExpressIds: [12],
          productGlobalIds: ['g12'],
          controllingScheduleGlobalIds: [],
          taskTime: { scheduleStart: '2026-05-20T12:00:00', scheduleFinish: '2026-06-01T17:00:00' },
        },
      ],
      workCalendars: [
        {
          expressId: 9,
          globalId: 'cal',
          name: 'HUYZ Calendar - 20260326 - 3 days only off in easter',
          workingTimes: [],
          exceptionTimes: [],
        },
      ],
    } as unknown as ScheduleExtraction
    const gantt = ganttFromExtraction(extraction)
    expect(gantt.name).toBe('20260326')
    expect(gantt.tasks.map((task) => [task.name, task.outlineLevel])).toEqual([
      ['V07', 0],
      ['Blok A', 1],
      ['9B', 2],
      ['9A', 2],
    ])
    expect(gantt.tasks[2].productExpressIds).toEqual([10, 11])
    expect(gantt.sequences[0]).toMatchObject({ fromId: '9a', toId: '9b', type: 'FS' })
    expect(gantt.tasks[1].childIds).toEqual(['9b', '9a'])
    expect(gantt.calendars?.[0]?.name).toMatch(/HUYZ Calendar/)
    expect(gantt.tasks[2].calendarIds).toEqual(['cal'])
  })
})

describe('schedule grouping', () => {
  it('hides children until the parent is expanded', () => {
    const tasks = ganttFromExtraction({
      hasSchedule: true,
      workSchedules: [],
      sequences: [],
      tasks: [
        {
          expressId: 1,
          globalId: 'root',
          name: 'V07',
          isMilestone: false,
          childGlobalIds: ['walls'],
          productExpressIds: [],
          productGlobalIds: [],
          controllingScheduleGlobalIds: [],
        },
        {
          expressId: 2,
          globalId: 'walls',
          name: 'Walls',
          parentGlobalId: 'root',
          isMilestone: false,
          childGlobalIds: ['lvl'],
          productExpressIds: [],
          productGlobalIds: [],
          controllingScheduleGlobalIds: [],
        },
        {
          expressId: 3,
          globalId: 'lvl',
          name: '00',
          parentGlobalId: 'walls',
          isMilestone: false,
          childGlobalIds: ['zone'],
          productExpressIds: [],
          productGlobalIds: [],
          controllingScheduleGlobalIds: [],
        },
        {
          expressId: 4,
          globalId: 'zone',
          name: '9B',
          parentGlobalId: 'lvl',
          isMilestone: false,
          childGlobalIds: [],
          productExpressIds: [99],
          productGlobalIds: [],
          controllingScheduleGlobalIds: [],
        },
      ],
    } as unknown as ScheduleExtraction).tasks
    expect(visibleScheduleTasks(tasks, new Set()).map((task) => task.name)).toEqual(['V07'])
    expect(visibleScheduleTasks(tasks, new Set(['root'])).map((task) => task.name)).toEqual(['V07', 'Walls'])
  })

  it('pivots grouping on outline level, not task names', () => {
    const model = ganttFromExtraction({
      hasSchedule: true,
      workSchedules: [],
      sequences: [],
      tasks: [
        {
          expressId: 1,
          globalId: 'root',
          name: 'V07',
          isMilestone: false,
          childGlobalIds: ['walls'],
          productExpressIds: [],
          productGlobalIds: [],
          controllingScheduleGlobalIds: [],
        },
        {
          expressId: 2,
          globalId: 'walls',
          name: 'Walls',
          parentGlobalId: 'root',
          isMilestone: false,
          childGlobalIds: ['lvl'],
          productExpressIds: [],
          productGlobalIds: [],
          controllingScheduleGlobalIds: [],
        },
        {
          expressId: 3,
          globalId: 'lvl',
          name: '00',
          parentGlobalId: 'walls',
          isMilestone: false,
          childGlobalIds: ['zone'],
          productExpressIds: [],
          productGlobalIds: [],
          controllingScheduleGlobalIds: [],
        },
        {
          expressId: 4,
          globalId: 'zone',
          name: '9B',
          parentGlobalId: 'lvl',
          isMilestone: false,
          childGlobalIds: [],
          productExpressIds: [99],
          productGlobalIds: [],
          controllingScheduleGlobalIds: [],
        },
      ],
    } as unknown as ScheduleExtraction)
    expect(outlineLevels(model.tasks)).toEqual([1, 2, 3])
    const byL2 = groupedScheduleTasks(model.tasks, 2)
    expect(byL2[0].name).toBe('00')
    expect(byL2.map((task) => task.name)).toContain('Walls')
    expect(byL2.at(-1)?.name).toBe('9B')
    const byL1 = groupedScheduleTasks(model.tasks, 1)
    expect(byL1[0].name).toBe('Walls')
    expect(byL1.some((task) => task.name === '00')).toBe(true)
  })
})

describe('parseScheduleCsv', () => {
  it('reads name, dates, and FS predecessors', () => {
    const csv = `Task Name,Start,Finish,Predecessors
Foundation,2026-03-26,2026-04-01,
Walls,2026-04-01,2026-04-10,1FS
`
    const model = parseScheduleCsv(new TextEncoder().encode(csv), 'plan.csv')
    expect(model.tasks.map((task) => task.name)).toEqual(['Foundation', 'Walls'])
    expect(model.sequences).toEqual([{ fromId: '1', toId: '2', type: 'FS' }])
  })
})

describe('parsePredecessorToken', () => {
  it('defaults a bare id to finish-start', () => {
    expect(parsePredecessorToken('12', new Set(['12']))).toEqual({ id: '12', type: 'FS', lag: '' })
  })
})

describe('barPercent', () => {
  it('places a bar inside the schedule range', () => {
    const range = scheduleRange([
      { start: new Date('2026-01-01T00:00:00Z'), finish: new Date('2026-01-11T00:00:00Z') },
    ])
    expect(range).toBeTruthy()
    const bar = barPercent(
      new Date('2026-01-01T00:00:00Z'),
      new Date('2026-01-11T00:00:00Z'),
      range!.start,
      range!.finish,
    )
    expect(bar?.left).toBe(0)
    expect(bar?.width).toBeGreaterThan(90)
  })
})

describe('4D simulateAt', () => {
  it('hides products before start, highlights during, and completes after finish', () => {
    const tasks: GanttTask[] = [
      {
        id: 'wall',
        name: 'Walls',
        outlineLevel: 0,
        start: new Date('2026-04-01T00:00:00Z'),
        finish: new Date('2026-04-10T00:00:00Z'),
        isMilestone: false,
        productExpressIds: [10, 11],
        childIds: [],
      },
      {
        id: 'slab',
        name: 'Slabs',
        outlineLevel: 0,
        start: new Date('2026-04-10T00:00:00Z'),
        finish: new Date('2026-04-20T00:00:00Z'),
        isMilestone: false,
        productExpressIds: [20],
        childIds: [],
      },
    ]
    const windows = productWindows(tasks)
    const before = simulateAt(windows, [10, 11, 20, 99], new Date('2026-03-01T00:00:00Z'))
    expect([...before.planned].sort()).toEqual([10, 11, 20])
    expect([...before.unassigned]).toEqual([99])
    const early = simulateAt(windows, [10, 11, 20, 99], new Date('2026-04-03T00:00:00Z'))
    expect([...early.active]).toEqual([10])
    expect(early.activityOf.get(10)).toBe('Walls')
    const mid = simulateAt(windows, [10, 11, 20, 99], new Date('2026-04-08T00:00:00Z'))
    expect([...mid.active].sort()).toEqual([10, 11])
    expect([...mid.planned]).toEqual([20])
    const afterWalls = simulateAt(windows, [10, 11, 20, 99], new Date('2026-04-15T00:00:00Z'))
    expect([...afterWalls.done].sort()).toEqual([10, 11])
    expect([...afterWalls.active]).toEqual([20])
    expect(afterWalls.activityOf.get(20)).toBe('Slabs')
    const done = simulateAt(windows, [10, 11, 20, 99], new Date('2026-05-01T00:00:00Z'))
    expect([...done.done].sort()).toEqual([10, 11, 20])
    expect(done.active.size).toBe(0)
  })

  it('uses parent dates when a linked task has none', () => {
    const windows = productWindows([
      {
        id: 'parent',
        name: 'Walls',
        outlineLevel: 0,
        start: new Date('2026-04-01T00:00:00Z'),
        finish: new Date('2026-04-10T00:00:00Z'),
        isMilestone: false,
        productExpressIds: [],
        childIds: ['child'],
      },
      {
        id: 'child',
        name: 'Walls 00',
        outlineLevel: 1,
        parentId: 'parent',
        start: null,
        finish: null,
        isMilestone: false,
        productExpressIds: [44],
        childIds: [],
      },
    ])
    const mid = simulateAt(windows, [44], new Date('2026-04-05T00:00:00Z'))
    expect([...mid.active]).toEqual([44])
    expect(mid.activityOf.get(44)).toBe('Walls')
  })
})

describe('namedActivity', () => {
  it('maps task names onto construction families', () => {
    expect(namedActivity('Walls 00')).toBe('Walls')
    expect(namedActivity('Predals')).toBe('Predals')
    expect(namedActivity('9B')).toBeNull()
  })
})

describe('resource loading', () => {
  it('parses Resource Data quantities and spreads them over the task', () => {
    expect(kindFromCode('LO20')).toBe('labor')
    expect(kindFromCode('MA22.90.HULP')).toBe('material')
    expect(parseResourceValue('1.00 h')).toEqual({ quantity: 1, unit: 'h' })
    expect(parseResourceValue('0.01 st')).toEqual({ quantity: 0.01, unit: 'st' })
    const tasks: GanttTask[] = [
      {
        id: 'wall',
        name: 'Walls',
        outlineLevel: 0,
        start: new Date(2026, 3, 1),
        finish: new Date(2026, 3, 3),
        isMilestone: false,
        productExpressIds: [10],
        childIds: [],
      },
    ]
    const resources = new Map([
      [
        10,
        [
          { code: 'LO20', kind: 'labor' as const, unit: 'h', quantity: 10 },
          { code: 'MA01', kind: 'material' as const, unit: 'st', quantity: 4 },
        ],
      ],
    ])
    const april = { start: new Date(2026, 3, 1), finish: new Date(2026, 3, 3) }
    const labor = resourceHistogram(tasks, resources, april, 'labor')
    expect(labor?.unit).toBe('h')
    expect(labor?.keys).toEqual(['2026-04'])
    expect(labor?.consumed).toBeCloseTo(10)
    expect(labor?.avgCrew).toBeCloseTo(10 / (8 * 2))
    expect(labor?.peakCrew).toBeCloseTo(5 / 8)
    expect(resourceHistogram(tasks, resources, april, 'material')?.consumed).toBeCloseTo(4)
  })

  it('clips consumption until a date and buckets by month', () => {
    const tasks: GanttTask[] = [
      {
        id: 'wall',
        name: 'Walls',
        outlineLevel: 0,
        start: new Date(2026, 3, 1),
        finish: new Date(2026, 4, 1),
        isMilestone: false,
        productExpressIds: [10],
        childIds: [],
      },
    ]
    const resources = new Map([[10, [{ code: 'LO20', kind: 'labor' as const, unit: 'h', quantity: 30 }]]])
    const untilApril = resourceHistogram(
      tasks,
      resources,
      { start: new Date(2026, 3, 1), finish: new Date(2026, 3, 15) },
      'labor',
    )
    expect(untilApril?.keys).toEqual(['2026-04'])
    expect(untilApril?.consumed).toBeGreaterThan(0)
    expect(untilApril?.consumed).toBeLessThan(30)
    const byDay = resourceHistogram(
      tasks,
      resources,
      { start: new Date(2026, 3, 1), finish: new Date(2026, 3, 3) },
      'labor',
      8,
      'day',
    )
    expect(byDay?.grain).toBe('day')
    expect(byDay?.keys[0]).toBe('2026-04-01')
    expect(byDay?.keys.length).toBeGreaterThan(1)
    expect(byDay?.consumed).toBeGreaterThan(0)
    const full = resourceHistogram(
      tasks,
      resources,
      { start: new Date(2026, 3, 1), finish: new Date(2026, 4, 1) },
      'labor',
    )
    expect(full?.keys).toEqual(['2026-04', '2026-05'])
    expect(full?.consumed).toBeCloseTo(30)
  })

  it('applies a user crew period to overlapping months', () => {
    const keys = ['2026-04', '2026-05', '2026-06']
    const planned = plannedCrewByMonth(keys, [
      { id: 'a', from: new Date(2026, 3, 1), until: new Date(2026, 4, 15), crew: 12 },
    ])
    expect(planned).toEqual([12, 12, 0])
  })
})

describe('cumulative cost', () => {
  it('spreads leaf task cost and accumulates by month', () => {
    const tasks: GanttTask[] = [
      {
        id: 'root',
        name: 'V07',
        outlineLevel: 0,
        start: new Date(2026, 3, 1),
        finish: new Date(2026, 4, 1),
        isMilestone: false,
        productExpressIds: [],
        childIds: ['wall'],
        cost: 300,
      },
      {
        id: 'wall',
        name: 'Walls',
        outlineLevel: 1,
        parentId: 'root',
        start: new Date(2026, 3, 1),
        finish: new Date(2026, 4, 1),
        isMilestone: false,
        productExpressIds: [10],
        childIds: [],
        cost: 300,
        currency: 'USD',
      },
    ]
    const curve = costCurve(tasks, { start: new Date(2026, 3, 1), finish: new Date(2026, 4, 1) })
    expect(curve?.keys).toEqual(['2026-04', '2026-05'])
    expect(curve?.total).toBeCloseTo(300)
    expect(curve?.cumulative[0]).toBeGreaterThan(0)
    expect(curve?.cumulative[1]).toBeCloseTo(300)
    expect(spentAt(curve!, new Date(2026, 3, 1))).toBeLessThan(curve!.cumulative[0] + 1)
    expect(isFutureMonth('2026-05', new Date(2026, 3, 15))).toBe(true)
    expect(isFutureMonth('2026-04', new Date(2026, 3, 15))).toBe(false)
    expect(monthPlayheadPercent(['2026-04', '2026-05'], new Date(2026, 3, 1))).toBe(0)
    expect(monthPlayheadPercent(['2026-04', '2026-05'], new Date(2026, 4, 1))).toBe(50)
  })

  it('follows IFC leaf task dates, not a late hockey-stick', () => {
    const monthly = [79750, 341484, 435042, 593107, 276546, 248160, 307222, 179050, 61596]
    const childIds = monthly.map((_, index) => `leaf-${index}`)
    const tasks: GanttTask[] = [
      {
        id: 'root',
        name: 'V07',
        outlineLevel: 0,
        start: new Date(2026, 2, 26),
        finish: new Date(2026, 10, 19),
        isMilestone: false,
        productExpressIds: [],
        childIds,
        cost: monthly.reduce((sum, value) => sum + value, 0),
        currency: 'USD',
      },
      ...monthly.map((cost, index) => ({
        id: `leaf-${index}`,
        name: `Leaf ${index}`,
        outlineLevel: 1,
        parentId: 'root',
        start: new Date(2026, 2 + index, 1),
        finish: new Date(2026, 2 + index, 28),
        isMilestone: false,
        productExpressIds: [index + 1],
        childIds: [],
        cost,
        currency: 'USD',
      })),
    ]
    const curve = costCurve(tasks, { start: new Date(2026, 2, 1), finish: new Date(2026, 10, 28) })
    expect(curve?.keys[0]).toBe('2026-03')
    expect(curve?.keys[3]).toBe('2026-06')
    expect(curve!.monthly[0]).toBeGreaterThan(50_000)
    expect(curve!.cumulative[3] / curve!.total).toBeGreaterThan(0.5)
    expect(curve!.cumulative[3] / curve!.total).toBeLessThan(0.65)
  })
})

function weekCalendar(exceptions: Array<{ start: string; finish: string }> = []): WorkCalendarInfo {
  return {
    expressId: 1,
    globalId: 'cal',
    name: 'HUYZ Calendar',
    workingTimes: [
      {
        recurrencePattern: {
          recurrenceType: 'WEEKLY',
          dayComponent: [],
          weekdayComponent: [1, 2, 3, 4, 5, 6],
          monthComponent: [],
          timePeriods: [{ start: '06:00', end: '17:00' }],
        },
      },
      {
        recurrencePattern: {
          recurrenceType: 'WEEKLY',
          dayComponent: [],
          weekdayComponent: [7],
          monthComponent: [],
          timePeriods: [],
        },
      },
    ],
    exceptionTimes: exceptions.map(({ start, finish }) => ({
      start,
      finish,
      recurrencePattern: {
        recurrenceType: 'DAILY',
        dayComponent: [],
        weekdayComponent: [],
        monthComponent: [],
        timePeriods: [],
      },
    })),
  }
}

describe('work calendar', () => {
  const calendar = weekCalendar([{ start: '2026-04-06', finish: '2026-04-08' }])

  it('treats Saturday as work and Sunday plus Easter as off', () => {
    expect(ifcWeekday(new Date(2026, 3, 6))).toBe(1)
    expect(isWorkingDay(new Date(2026, 3, 3), calendar)).toBe(true)
    expect(isWorkingDay(new Date(2026, 3, 4), calendar)).toBe(true)
    expect(isWorkingDay(new Date(2026, 3, 5), calendar)).toBe(false)
    expect(isWorkingDay(new Date(2026, 3, 6), calendar)).toBe(false)
    expect(isWorkingDay(new Date(2026, 3, 7), calendar)).toBe(false)
    expect(isWorkingDay(new Date(2026, 3, 8), calendar)).toBe(false)
    expect(isWorkingDay(new Date(2026, 3, 9), calendar)).toBe(true)
  })

  it('keeps hours and cost off non-working days', () => {
    const tasks: GanttTask[] = [
      {
        id: 'wall',
        name: 'Walls',
        outlineLevel: 0,
        start: new Date(2026, 3, 1),
        finish: new Date(2026, 3, 9),
        isMilestone: false,
        productExpressIds: [10],
        childIds: [],
        calendarIds: ['cal'],
        cost: 8,
        currency: 'USD',
      },
    ]
    const resources = new Map([[10, [{ code: 'LO20', kind: 'labor' as const, unit: 'h', quantity: 8 }]]])
    const range = { start: new Date(2026, 3, 1), finish: new Date(2026, 3, 8) }
    const load = resourceHistogram(tasks, resources, range, 'labor', 8, 'day', [calendar])
    expect(load?.keys[0]).toBe('2026-04-01')
    const byKey = new Map(load!.keys.map((key, index) => [key, load!.totals[index]]))
    expect(byKey.get('2026-04-04')).toBeCloseTo(2)
    expect(byKey.get('2026-04-05')).toBe(0)
    expect(byKey.get('2026-04-06')).toBe(0)
    expect(byKey.get('2026-04-07')).toBe(0)
    expect(byKey.get('2026-04-08')).toBe(0)
    expect(load?.consumed).toBeCloseTo(8)
    const curve = costCurve(tasks, range, 'day', [calendar])
    const costByKey = new Map(curve!.keys.map((key, index) => [key, curve!.monthly[index]]))
    expect(costByKey.get('2026-04-05')).toBe(0)
    expect(costByKey.get('2026-04-06')).toBe(0)
    expect(curve?.total).toBeCloseTo(8)
    expect(nonWorkingKeys(load!.keys, calendar).has('2026-04-06')).toBe(true)
  })
})
