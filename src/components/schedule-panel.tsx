import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { CalendarRange, ChevronDown, ChevronLeft, ChevronRight, Maximize2, Minimize2, Pause, Play, Plus, Square, Upload, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ResizeHandle } from '@/components/resize-handle'
import {
  addMs,
  barPercent,
  dateAtPercent,
  formatScheduleDay,
  formatMonthLabel,
  fromBucketKey,
  fromDateInput,
  monthKey,
  percentAtDate,
  scheduleRange,
  toDateInput,
} from '@/lib/schedule/dates'
import { activityCss, namedActivity } from '@/lib/schedule/activity-color'
import { nonWorkingKeys } from '@/lib/schedule/calendar'
import {
  costCurve,
  formatScheduleMoney,
  isFutureMonth,
  monthPlayheadPercent,
  spentAt,
} from '@/lib/schedule/cost'
import { histogramMonthIndex, plannedCrewByMonth, resourceHistogram, type CrewPeriod } from '@/lib/schedule/resource-load'
import { activityOf } from '@/lib/schedule/simulate'
import type { GanttModel, GanttTask, ResourceKind } from '@/lib/schedule/types'
import {
  defaultExpandedIds,
  groupedScheduleTasks,
  outlineLevels,
  parentIdsWithChildren,
  visibleScheduleTasks,
  type ScheduleGroupMode,
} from '@/lib/schedule/view-tree'
import { cn, formatCount } from '@/lib/utils'

const DEFAULT_HEIGHT = 340
const MIN_HEIGHT = 200
const MAX_HEIGHT = 560
const CHART_MAX_HEIGHT = 780

const LOAD_KINDS: Array<{ id: ResourceKind | 'all'; label: string }> = [
  { id: 'labor', label: 'Labor' },
  { id: 'material', label: 'Material' },
  { id: 'equipment', label: 'Plant' },
  { id: 'all', label: 'All' },
]

const CHART_VIEWS = [
  { id: 'resources', label: 'Resources' },
  { id: 'cost', label: 'Cost' },
  { id: 'both', label: 'Both' },
] as const

type ChartView = (typeof CHART_VIEWS)[number]['id']

type SchedulePanelProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  model: GanttModel | null
  loading: boolean
  selectedTaskId: string | null
  onSelectTask: (task: GanttTask) => void
  onImport: () => void
  onReloadIfc: () => void
  canReloadIfc: boolean
  height: number
  onHeightChange: (height: number) => void
  simDate: Date | null
  onSimDateChange: (date: Date | null) => void
}

export function ScheduleDock({
  open,
  onOpenChange,
  model,
  loading,
  selectedTaskId,
  onSelectTask,
  onImport,
  onReloadIfc,
  canReloadIfc,
  height,
  onHeightChange,
  simDate,
  onSimDateChange,
}: SchedulePanelProps) {
  const count = model?.tasks.length ?? 0
  const [chartMax, setChartMax] = useState(false)
  const restoredHeight = useRef(height)
  const onChartMaxChange = (next: boolean) => {
    if (next && !chartMax) {
      restoredHeight.current = height
      onHeightChange(Math.round(Math.min(Math.max(window.innerHeight * 0.52, 460), CHART_MAX_HEIGHT)))
    } else if (!next && chartMax) {
      onHeightChange(restoredHeight.current || DEFAULT_HEIGHT)
    }
    setChartMax(next)
  }
  return (
    <div className="flex shrink-0 flex-col border-t border-border bg-card">
      {open ? (
        <>
          <ResizeHandle
            label="Resize schedule panel"
            axis="y"
            onDrag={(delta) =>
              onHeightChange(
                Math.min(chartMax ? CHART_MAX_HEIGHT : MAX_HEIGHT, Math.max(MIN_HEIGHT, height - delta)),
              )
            }
            onReset={() => {
              onChartMaxChange(false)
              onHeightChange(DEFAULT_HEIGHT)
            }}
          />
          <div className="min-h-0 overflow-hidden" style={{ height }}>
            <SchedulePanel
              model={model}
              loading={loading}
              selectedTaskId={selectedTaskId}
              onSelectTask={onSelectTask}
              onImport={onImport}
              onReloadIfc={onReloadIfc}
              canReloadIfc={canReloadIfc}
              simDate={simDate}
              onSimDateChange={onSimDateChange}
              chartMax={chartMax}
              onChartMaxChange={onChartMaxChange}
            />
          </div>
        </>
      ) : null}
      <div className="flex h-7 shrink-0 items-center gap-2 border-t border-border bg-muted px-2">
          <button
            type="button"
            className={cn(
              'flex h-6 items-center gap-1 rounded px-2 text-[11px]',
              open ? 'bg-card text-primary' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
            onClick={() => {
              const next = !open
              onOpenChange(next)
              if (!next) onSimDateChange(null)
            }}
          >
          <CalendarRange className="h-3.5 w-3.5" />
          Schedule
          {count > 0 ? <span className="font-mono text-[10px]">{formatCount(count)}</span> : null}
          <ChevronDown className={cn('h-3 w-3 transition-transform', open && 'rotate-180')} />
        </button>
      </div>
    </div>
  )
}

function SchedulePanel({
  model,
  loading,
  selectedTaskId,
  onSelectTask,
  onImport,
  onReloadIfc,
  canReloadIfc,
  simDate,
  onSimDateChange,
  chartMax,
  onChartMaxChange,
}: Omit<SchedulePanelProps, 'open' | 'onOpenChange' | 'height' | 'onHeightChange'> & {
  chartMax: boolean
  onChartMaxChange: (max: boolean) => void
}) {
  const [mode, setMode] = useState<ScheduleGroupMode>('wbs')
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState<1 | 4>(1)
  const [loadKind, setLoadKind] = useState<ResourceKind | 'all'>('labor')
  const [frameFrom, setFrameFrom] = useState('')
  const [frameUntil, setFrameUntil] = useState('')
  const [hoursPerDay, setHoursPerDay] = useState(8)
  const [crewDraft, setCrewDraft] = useState(12)
  const [crewPeriods, setCrewPeriods] = useState<CrewPeriod[]>([])
  const [zoomMonth, setZoomMonth] = useState<string | null>(null)
  const [chartView, setChartView] = useState<ChartView>('both')
  const levels = useMemo(() => outlineLevels(model?.tasks ?? []), [model])
  const groupModes = useMemo(
    () => [
      { id: 'wbs' as ScheduleGroupMode, label: 'WBS' },
      ...levels.map((level) => ({ id: level as ScheduleGroupMode, label: `L${level}` })),
    ],
    [levels],
  )
  useEffect(() => {
    if (mode !== 'wbs' && !levels.includes(mode)) setMode('wbs')
  }, [levels, mode])
  const viewTasks = useMemo(
    () => (model ? groupedScheduleTasks(model.tasks, mode) : []),
    [model, mode],
  )
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  useEffect(() => {
    setExpanded(defaultExpandedIds(viewTasks, 1))
  }, [viewTasks])
  const rows = useMemo(() => visibleScheduleTasks(viewTasks, expanded), [viewTasks, expanded])
  const range = useMemo(() => (model ? scheduleRange(model.tasks) : null), [model])
  useEffect(() => {
    if (!range) return
    setFrameFrom(toDateInput(range.start))
    setFrameUntil(toDateInput(range.finish))
    setZoomMonth(null)
  }, [range])
  const loadWindow = useMemo(() => {
    if (!range) return null
    const from = fromDateInput(frameFrom) ?? range.start
    const until = fromDateInput(frameUntil) ?? range.finish
    if (until.getTime() < from.getTime()) return { start: until, finish: from }
    return { start: from, finish: until }
  }, [range, frameFrom, frameUntil])
  const grain = zoomMonth ? 'day' : 'month'
  const chartWindow = useMemo(() => {
    if (zoomMonth) {
      const start = fromBucketKey(zoomMonth)
      if (!start) return loadWindow
      return {
        start,
        finish: new Date(start.getFullYear(), start.getMonth() + 1, 0),
      }
    }
    return loadWindow
  }, [zoomMonth, loadWindow])
  const warnings = model?.warnings ?? []
  const playheadPct = range && simDate ? percentAtDate(range, simDate) : null
  const simDateRef = useRef(simDate)
  simDateRef.current = simDate
  const rowIndex = useMemo(() => new Map(viewTasks.map((task) => [task.id, task])), [viewTasks])
  const legend = useMemo(() => {
    if (!model) return []
    const byId = new Map(model.tasks.map((task) => [task.id, task]))
    const seen = new Set<string>()
    for (const task of model.tasks) {
      if (task.productExpressIds.length === 0) continue
      seen.add(activityOf(task, byId))
    }
    return [...seen]
  }, [model])
  const load = useMemo(
    () =>
      model?.productResources && chartWindow
        ? resourceHistogram(
            model.tasks,
            model.productResources,
            chartWindow,
            loadKind,
            hoursPerDay,
            grain,
            model.calendars,
          )
        : null,
    [model, chartWindow, loadKind, hoursPerDay, grain],
  )
  const cost = useMemo(
    () => (model && chartWindow ? costCurve(model.tasks, chartWindow, grain, model.calendars) : null),
    [model, chartWindow, grain],
  )
  const plannedCrew = useMemo(
    () => (load ? plannedCrewByMonth(load.keys, crewPeriods) : []),
    [load, crewPeriods],
  )

  useEffect(() => {
    if (!playing || !range) return
    let frame = 0
    let last = performance.now()
    const msPerSimDay = 110
    const tick = (now: number) => {
      const dt = Math.min(48, now - last)
      if (dt < 24) {
        frame = requestAnimationFrame(tick)
        return
      }
      last = now
      const from = simDateRef.current ?? range.start
      const next = addMs(from, (dt / msPerSimDay) * speed * 86_400_000)
      if (next.getTime() >= range.finish.getTime()) {
        setPlaying(false)
        onSimDateChange(range.finish)
        return
      }
      onSimDateChange(next)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing, range, speed, onSimDateChange])

  const seekPercent = (percent: number) => {
    if (!range) return
    setPlaying(false)
    onSimDateChange(dateAtPercent(range, percent))
  }

  const onPlayPause = () => {
    if (!range) return
    if (playing) {
      setPlaying(false)
      return
    }
    const atEnd = simDate != null && simDate.getTime() >= range.finish.getTime()
    onSimDateChange(atEnd || simDate == null ? range.start : simDate)
    setPlaying(true)
  }

  const onStopSim = () => {
    setPlaying(false)
    onSimDateChange(null)
  }

  const toggle = (id: string) => {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-border px-2">
        <p className="min-w-0 truncate text-[12px] font-medium">
          {loading ? 'Reading IfcTask / IfcWorkSchedule...' : model?.name || 'Schedule'}
        </p>
        {model?.calendars?.[0]?.name ? (
          <span
            className="hidden min-w-0 max-w-[18rem] truncate text-[11px] text-muted-foreground sm:inline"
            title="IfcWorkCalendar"
          >
            {model.calendars[0].name}
          </span>
        ) : null}
        <div className="flex shrink-0 rounded border border-border">
          {groupModes.map((item) => (
            <button
              key={String(item.id)}
              type="button"
              title={item.id === 'wbs' ? 'Native WBS' : `Task level ${item.id}`}
              className={cn(
                'h-6 px-2 text-[11px]',
                mode === item.id ? 'bg-primary text-white' : 'text-muted-foreground hover:bg-accent',
              )}
              onClick={() => setMode(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="h-6 px-1.5 text-[11px] text-muted-foreground hover:text-foreground"
          onClick={() => setExpanded(new Set(parentIdsWithChildren(viewTasks)))}
        >
          Expand all
        </button>
        <button
          type="button"
          className="h-6 px-1.5 text-[11px] text-muted-foreground hover:text-foreground"
          onClick={() => setExpanded(new Set())}
        >
          Collapse
        </button>
        <span className="min-w-0 flex-1" />
        {canReloadIfc ? (
          <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]" onClick={onReloadIfc}>
            Reload IFC
          </Button>
        ) : null}
        <Button variant="outline" size="sm" className="h-6 px-2 text-[11px]" onClick={onImport}>
          <Upload className="h-3 w-3" />
          Import...
        </Button>
      </div>
      {model?.hasSchedule && range ? (
        <div className="flex h-7 shrink-0 items-center gap-1.5 border-b border-border px-2">
          <button
            type="button"
            className="flex h-6 w-6 items-center justify-center rounded text-foreground hover:bg-accent"
            onClick={onPlayPause}
            aria-label={playing ? 'Pause simulation' : 'Play simulation'}
          >
            {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
            onClick={onStopSim}
            aria-label="Stop simulation"
          >
            <Square className="h-3 w-3" />
          </button>
          <button
            type="button"
            className={cn(
              'h-6 rounded px-1.5 font-mono text-[10px]',
              speed === 4 ? 'bg-primary text-white' : 'text-muted-foreground hover:bg-accent',
            )}
            onClick={() => setSpeed((current) => (current === 1 ? 4 : 1))}
          >
            {speed}Ã—
          </button>
          <input
            type="range"
            min={0}
            max={100}
            step={0.1}
            className="h-1 w-28 accent-amber-500"
            value={playheadPct ?? 0}
            onChange={(event) => seekPercent(Number(event.target.value))}
            aria-label="Simulation date"
          />
          <span className="font-mono text-[10px] text-foreground">
            {simDate ? formatScheduleDay(simDate) : 'Play 4D'}
          </span>
          <span className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
            {legend.map((name) => (
              <span key={name} className="flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground">
                <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: activityCss(name) }} />
                {name}
              </span>
            ))}
          </span>
        </div>
      ) : null}
      {warnings.length > 0 ? (
        <p className="shrink-0 border-b border-border px-2 py-1 text-[11px] text-muted-foreground">
          {formatCount(warnings.length)} import warning{warnings.length === 1 ? '' : 's'} — see console
        </p>
      ) : null}
      {loading ? (
        <p className="px-3 py-6 text-xs text-muted-foreground italic">Indexing construction tasks from the IFC...</p>
      ) : !model?.hasSchedule ? (
        <div className="flex flex-1 flex-col items-start justify-center gap-2 px-3">
          <p className="text-xs text-muted-foreground">
            No IfcTask in this model yet. Import Microsoft Project XML (preferred) or a CSV.
          </p>
          <Button size="sm" onClick={onImport}>
            Import schedule...
          </Button>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
        {chartMax ? null : (
        <div className="min-h-0 flex-1 overflow-auto">
          <div className="relative">
            <div className="sticky top-0 z-10 flex border-b border-border bg-card text-[10px] text-muted-foreground">
              <div className="w-80 shrink-0 px-2 py-1">
                {mode === 'wbs' ? 'Task' : `L${mode}`}
              </div>
              <button
                type="button"
                className="relative min-w-0 flex-1 px-2 py-1 text-left"
                onClick={(event) => {
                  if (!range) return
                  const rect = event.currentTarget.getBoundingClientRect()
                  seekPercent(((event.clientX - rect.left) / Math.max(1, rect.width)) * 100)
                }}
              >
                {range
                  ? `${formatScheduleDay(range.start)} -> ${formatScheduleDay(range.finish)}`
                  : 'No dates'}
              </button>
            </div>
            {rows.map((task) => {
              const bar = range ? barPercent(task.start, task.finish, range.start, range.finish) : null
              const hasKids = task.childIds.length > 0
              const open = expanded.has(task.id)
              const activity = activityOf(task, rowIndex)
              const barColor = activityCss(namedActivity(task.name) ?? activity)
              return (
                <div
                  key={task.id}
                  className={cn(
                    'flex w-full items-center border-b border-border/60 text-[12px] hover:bg-accent',
                    selectedTaskId === task.id && 'bg-primary/15',
                  )}
                >
                  <div className="flex w-80 shrink-0 items-center" style={{ paddingLeft: 4 + task.outlineLevel * 12 }}>
                    {hasKids ? (
                      <button
                        type="button"
                        className="flex h-6 w-5 shrink-0 items-center justify-center text-muted-foreground"
                        onClick={() => toggle(task.id)}
                        aria-label={open ? 'Collapse' : 'Expand'}
                      >
                        <ChevronRight className={cn('h-3.5 w-3.5', open && 'rotate-90')} />
                      </button>
                    ) : (
                      <span className="inline-block w-5 shrink-0" />
                    )}
                    <button
                      type="button"
                      className="min-w-0 flex-1 truncate py-1 text-left"
                      title={task.name}
                      onClick={() => onSelectTask(task)}
                    >
                      {task.name}
                      {task.productExpressIds.length > 0 ? (
                        <span className="ml-1 font-mono text-[10px] text-muted-foreground">
                          {formatCount(task.productExpressIds.length)}
                        </span>
                      ) : null}
                    </button>
                  </div>
                  <button
                    type="button"
                    className="relative h-6 min-w-0 flex-1"
                    onClick={() => onSelectTask(task)}
                  >
                    {bar ? (
                      <span
                        className={cn(
                          'absolute top-1.5 h-3 rounded-sm',
                          task.isMilestone && 'w-2 rotate-45',
                        )}
                        style={{
                          left: `${bar.left}%`,
                          width: task.isMilestone ? undefined : `${bar.width}%`,
                          backgroundColor: barColor,
                        }}
                      />
                    ) : null}
                  </button>
                </div>
              )
            })}
            {playheadPct != null ? (
              <div
                className="pointer-events-none absolute top-0 bottom-0 z-20 w-0.5 bg-amber-500"
                style={{ left: `calc(20rem + (100% - 20rem) * ${playheadPct / 100})` }}
              />
            ) : null}
          </div>
        </div>
        )}
        {load || cost ? (
          <ResourceLoadChart
            load={load}
            cost={cost}
            chartView={chartView}
            onChartViewChange={setChartView}
            loadKind={loadKind}
            onLoadKindChange={setLoadKind}
            frameFrom={frameFrom}
            frameUntil={frameUntil}
            onFrameFrom={setFrameFrom}
            onFrameUntil={setFrameUntil}
            minDate={range ? toDateInput(range.start) : undefined}
            maxDate={range ? toDateInput(range.finish) : undefined}
            simDate={simDate}
            hoursPerDay={hoursPerDay}
            onHoursPerDay={setHoursPerDay}
            crewDraft={crewDraft}
            onCrewDraft={setCrewDraft}
            crewPeriods={crewPeriods}
            plannedCrew={plannedCrew}
            onAddCrewPeriod={() => {
              const from = fromDateInput(frameFrom)
              const until = fromDateInput(frameUntil)
              if (!from || !until || crewDraft <= 0) return
              setCrewPeriods((current) => [
                ...current,
                { id: `${from.getTime()}-${until.getTime()}-${crewDraft}-${current.length}`, from, until, crew: crewDraft },
              ])
            }}
            onRemoveCrewPeriod={(id) => setCrewPeriods((current) => current.filter((period) => period.id !== id))}
            maximized={chartMax}
            onMaximizedChange={onChartMaxChange}
            calendarName={model?.calendars?.[0]?.name}
            offKeys={
              grain === 'day' && model?.calendars?.[0]
                ? nonWorkingKeys(load?.keys ?? cost?.keys ?? [], model.calendars[0])
                : undefined
            }
            onUntilPlayhead={
              simDate
                ? () => {
                    if (!range) return
                    setFrameFrom(toDateInput(range.start))
                    setFrameUntil(toDateInput(simDate))
                  }
                : undefined
            }
            onResetFrame={
              range
                ? () => {
                    setFrameFrom(toDateInput(range.start))
                    setFrameUntil(toDateInput(range.finish))
                    setZoomMonth(null)
                  }
                : undefined
            }
            zoomLabel={zoomMonth ? formatMonthLabel(fromBucketKey(zoomMonth) ?? new Date()) : null}
            onZoomOut={() => setZoomMonth(null)}
            onSeekMonth={(date) => {
              setPlaying(false)
              onSimDateChange(date)
              if (!zoomMonth) setZoomMonth(monthKey(date))
            }}
          />
        ) : null}
        </div>
      )}
    </div>
  )
}

export { DEFAULT_HEIGHT as SCHEDULE_PANEL_DEFAULT_HEIGHT }

function formatLoad(value: number, unit: string): string {
  const rounded = value >= 100 ? Math.round(value).toString() : value.toFixed(1)
  return unit === 'h' ? `${rounded} h` : rounded
}

function formatCrew(value: number): string {
  if (value <= 0) return '0'
  if (value < 10) return value.toFixed(1)
  return String(Math.round(value))
}

function costY(curve: NonNullable<ReturnType<typeof costCurve>>, index: number): number {
  if (index < 0) return 100
  const peak = Math.max(curve.total, 0.001)
  return 100 - (curve.cumulative[index] / peak) * 100
}

function costPolyline(curve: NonNullable<ReturnType<typeof costCurve>>, endRatio = 1): string {
  const count = Math.max(1, curve.keys.length)
  const limit = Math.min(1, Math.max(0, endRatio)) * 100
  const points: string[] = []
  const xAt = (index: number) => (index / count) * 100
  for (let index = 0; index <= count; index += 1) {
    const x = xAt(index)
    const y = costY(curve, index - 1)
    if (x <= limit) {
      points.push(`${x.toFixed(2)},${y.toFixed(2)}`)
      continue
    }
    const prevX = xAt(index - 1)
    const prevY = costY(curve, index - 2)
    const t = (limit - prevX) / Math.max(0.001, x - prevX)
    points.push(`${limit.toFixed(2)},${(prevY + (y - prevY) * t).toFixed(2)}`)
    break
  }
  return points.join(' ')
}

function CostLine({
  curve,
  playhead,
}: {
  curve: NonNullable<ReturnType<typeof costCurve>>
  playhead: number | null
}) {
  const full = costPolyline(curve, 1)
  const clipped = playhead == null ? full : costPolyline(curve, playhead / 100)
  return (
    <svg
      className="pointer-events-none absolute inset-0 z-20 h-full w-full"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      width="100%"
      height="100%"
      aria-hidden
    >
      <polyline
        fill="none"
        points={full}
        stroke="#f59e0b"
        strokeOpacity={playhead == null ? 1 : 0.28}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      {playhead != null ? (
        <polyline
          fill="none"
          points={clipped}
          stroke="#f59e0b"
          strokeWidth="2.25"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
    </svg>
  )
}

function ResourceLoadChart({
  load,
  cost,
  chartView,
  onChartViewChange,
  loadKind,
  onLoadKindChange,
  frameFrom,
  frameUntil,
  onFrameFrom,
  onFrameUntil,
  minDate,
  maxDate,
  simDate,
  onUntilPlayhead,
  onResetFrame,
  onSeekMonth,
  zoomLabel,
  onZoomOut,
  hoursPerDay,
  onHoursPerDay,
  crewDraft,
  onCrewDraft,
  crewPeriods,
  plannedCrew,
  onAddCrewPeriod,
  onRemoveCrewPeriod,
  maximized,
  onMaximizedChange,
  calendarName,
  offKeys,
}: {
  load: ReturnType<typeof resourceHistogram>
  cost: ReturnType<typeof costCurve>
  chartView: ChartView
  onChartViewChange: (view: ChartView) => void
  loadKind: ResourceKind | 'all'
  onLoadKindChange: (kind: ResourceKind | 'all') => void
  frameFrom: string
  frameUntil: string
  onFrameFrom: (value: string) => void
  onFrameUntil: (value: string) => void
  minDate?: string
  maxDate?: string
  simDate: Date | null
  onUntilPlayhead?: () => void
  onResetFrame?: () => void
  onSeekMonth: (date: Date) => void
  zoomLabel: string | null
  onZoomOut: () => void
  hoursPerDay: number
  onHoursPerDay: (value: number) => void
  crewDraft: number
  onCrewDraft: (value: number) => void
  crewPeriods: CrewPeriod[]
  plannedCrew: number[]
  onAddCrewPeriod: () => void
  onRemoveCrewPeriod: (id: string) => void
  maximized: boolean
  onMaximizedChange: (value: boolean) => void
  calendarName?: string
  offKeys?: Set<string>
}) {
  const canLoad = Boolean(load)
  const canCost = Boolean(cost)
  const view: ChartView =
    canLoad && canCost ? chartView : canCost ? 'cost' : 'resources'
  const showResources = view !== 'cost' && canLoad
  const showCost = view !== 'resources' && canCost
  const showBoth = showResources && showCost
  const keys = (showResources ? load?.keys : null) ?? cost?.keys ?? []
  const labels = (showResources ? load?.labels : null) ?? cost?.labels ?? []
  const spent = cost ? spentAt(cost, simDate) : 0
  const costPeak = cost ? Math.max(0.001, ...cost.monthly) : 1
  const playhead = simDate ? monthPlayheadPercent(keys, simDate) : null
  return (
    <div className={cn('flex min-h-0 flex-col border-t border-border', maximized ? 'flex-1' : showBoth ? 'h-[15.5rem] shrink-0' : 'h-[8.5rem] shrink-0')}>
      <div className="flex h-7 shrink-0 items-center gap-1.5 border-b border-border px-2">
        {canLoad && canCost ? (
          <div className="flex shrink-0 rounded border border-border">
            {CHART_VIEWS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={cn(
                  'h-5 px-1.5 text-[10px]',
                  view === item.id ? 'bg-primary text-white' : 'text-muted-foreground hover:bg-accent',
                )}
                onClick={() => onChartViewChange(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        ) : (
          <span className="text-[10px] font-medium text-foreground">{canCost && !canLoad ? 'Cumulative cost' : 'Resources'}</span>
        )}
        {showResources ? (
          <div className="flex shrink-0 rounded border border-border">
            {LOAD_KINDS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={cn(
                  'h-5 px-1.5 text-[10px]',
                  loadKind === item.id ? 'bg-primary text-white' : 'text-muted-foreground hover:bg-accent',
                )}
                onClick={() => onLoadKindChange(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        ) : null}
        {zoomLabel ? (
          <button
            type="button"
            className="flex h-5 items-center gap-0.5 rounded px-1.5 text-[10px] text-foreground hover:bg-accent"
            onClick={onZoomOut}
          >
            <ChevronLeft className="h-3 w-3" />
            Months
            <span className="text-muted-foreground">· {zoomLabel}</span>
          </button>
        ) : null}
        <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
          From
          <input
            type="date"
            className="h-5 rounded border border-border bg-background px-1 text-[10px] text-foreground"
            value={frameFrom}
            min={minDate}
            max={frameUntil || maxDate}
            onChange={(event) => onFrameFrom(event.target.value)}
          />
        </label>
        <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
          Until
          <input
            type="date"
            className="h-5 rounded border border-border bg-background px-1 text-[10px] text-foreground"
            value={frameUntil}
            min={frameFrom || minDate}
            max={maxDate}
            onChange={(event) => onFrameUntil(event.target.value)}
          />
        </label>
        {onUntilPlayhead ? (
          <button
            type="button"
            className="h-5 px-1.5 text-[10px] text-muted-foreground hover:text-foreground"
            onClick={onUntilPlayhead}
          >
            Until playhead
          </button>
        ) : null}
        {onResetFrame ? (
          <button
            type="button"
            className="h-5 px-1.5 text-[10px] text-muted-foreground hover:text-foreground"
            onClick={onResetFrame}
          >
            Full
          </button>
        ) : null}
        {showResources ? (
          <>
            <label className="flex items-center gap-1 text-[10px] text-muted-foreground" title="Hours per person per day">
              <input
                type="number"
                min={1}
                max={24}
                step={1}
                className="h-5 w-10 rounded border border-border bg-background px-1 text-center font-mono text-[10px] text-foreground"
                value={hoursPerDay}
                onChange={(event) => onHoursPerDay(Math.max(1, Math.min(24, Number(event.target.value) || 8)))}
              />
              h/person/day
            </label>
            <label className="flex items-center gap-1 text-[10px] text-muted-foreground" title="Crew for the From-Until range">
              <input
                type="number"
                min={1}
                max={999}
                step={1}
                className="h-5 w-10 rounded border border-border bg-background px-1 text-center font-mono text-[10px] text-foreground"
                value={crewDraft}
                onChange={(event) => onCrewDraft(Math.max(1, Math.min(999, Number(event.target.value) || 1)))}
              />
              crew
            </label>
            <button
              type="button"
              className="flex h-5 items-center gap-1 rounded px-1.5 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground"
              onClick={onAddCrewPeriod}
            >
              <Plus className="h-3 w-3" />
              Set for range
            </button>
          </>
        ) : null}
        <span className="min-w-0 flex-1" />
        <span className="font-mono text-[10px] text-foreground">
          {showResources && load ? `Consumed ${formatLoad(load.consumed, load.unit)}` : null}
          {showResources && load?.peakCrew ? ` · need ${formatCrew(load.avgCrew)} avg / ${Math.ceil(load.peakCrew)} peak` : ''}
          {showCost && cost
            ? `${showResources ? ' · ' : ''}${simDate ? 'Spent' : 'Cost'} ${formatScheduleMoney(simDate ? spent : cost.total, cost.currency)}${
                simDate ? ` / ${formatScheduleMoney(cost.total, cost.currency)}` : ''
              }`
            : ''}
        </span>
        <button
          type="button"
          className="flex h-5 items-center gap-1 px-1.5 text-[10px] text-muted-foreground hover:text-foreground"
          onClick={() => onMaximizedChange(!maximized)}
          aria-label={maximized ? 'Restore resource chart' : 'Maximise resource chart'}
        >
          {maximized ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
          {maximized ? 'Restore' : 'Maximise'}
        </button>
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="flex w-80 shrink-0 flex-col gap-2 overflow-auto px-2 py-1">
          <div className="flex flex-col justify-center gap-1">
            {showResources
              ? (load?.series ?? []).map((series) => (
                  <span key={series.code} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: series.color }} />
                    <span className="truncate">{series.code}</span>
                  </span>
                ))
              : null}
            {showCost ? (
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <span className="h-0.5 w-2.5 shrink-0 rounded-sm bg-amber-500" />
                <span className="truncate">Cumulative cost</span>
              </span>
            ) : null}
          </div>
          {showResources && crewPeriods.length > 0 ? (
            <div className="flex flex-col gap-1 border-t border-border pt-1">
              <p className="text-[10px] text-muted-foreground">Defined crew</p>
              {crewPeriods.map((period) => (
                <span key={period.id} className="flex items-center gap-1 text-[10px] text-foreground">
                  <span className="min-w-0 flex-1 truncate font-mono">
                    {period.crew} · {formatScheduleDay(period.from)}–{formatScheduleDay(period.until)}
                  </span>
                  <button
                    type="button"
                    className="flex h-4 w-4 items-center justify-center text-muted-foreground hover:text-foreground"
                    aria-label="Remove crew period"
                    onClick={() => onRemoveCrewPeriod(period.id)}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <p className="text-[10px] text-muted-foreground">
              {showResources
                ? `Planned hours from Resource Data, spread over working days in ${calendarName ?? 'the IFC calendar'} — weekends and holidays get none.${zoomLabel ? '' : ' Click a month for days.'}`
                : `Cost is planned IfcCostItem USD on each task, spread over working days${calendarName ? ` in ${calendarName}` : ''}.`}
            </p>
          )}
        </div>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden px-3 pt-2 pb-1">
          {showResources && load ? (
            <ChartPlot
              keys={keys}
              labels={labels}
              simDate={simDate}
              onSeek={onSeekMonth}
              maximized={maximized}
              showLabels={!showCost}
              playhead={playhead}
              offKeys={offKeys}
              title={showBoth ? 'Resources' : undefined}
              captions={
                maximized
                  ? keys.map((key, index) => {
                      const total = load.totals[index] ?? 0
                      return (
                        <span key={`rcap-${key}`}>
                          {total > 0 ? formatLoad(total, load.unit) : '\u00a0'}
                          {load.crewPeak[index] > 0 || plannedCrew[index] > 0 ? (
                            <span
                              className={cn(
                                'block',
                                plannedCrew[index] > 0 && load.crewPeak[index] > plannedCrew[index]
                                  ? 'text-red-600'
                                  : 'text-muted-foreground',
                              )}
                            >
                              {load.crewPeak[index] > 0 ? `${Math.ceil(load.crewPeak[index])} need` : ''}
                              {plannedCrew[index] > 0
                                ? `${load.crewPeak[index] > 0 ? ' / ' : ''}${plannedCrew[index]} have`
                                : ''}
                            </span>
                          ) : null}
                        </span>
                      )
                    })
                  : undefined
              }
              renderBar={(index) => {
                const total = load.totals[index] ?? 0
                if (total <= 0) return null
                return (
                  <div
                    className="absolute inset-x-0 bottom-0 flex flex-col-reverse overflow-hidden rounded-sm"
                    style={{ height: `${(total / load.peak) * 100}%`, opacity: 0.9 }}
                  >
                    {load.series.map((series) => {
                      const value = series.values[index]
                      if (value <= 0) return null
                      return (
                        <div
                          key={series.code}
                          className="w-full min-h-px"
                          style={{
                            height: `${(value / total) * 100}%`,
                            backgroundColor: series.color,
                          }}
                        />
                      )
                    })}
                  </div>
                )
              }}
            />
          ) : null}
          {showCost && cost ? (
            <ChartPlot
              keys={keys}
              labels={labels}
              simDate={simDate}
              onSeek={onSeekMonth}
              maximized={maximized}
              showLabels
              playhead={playhead}
              offKeys={offKeys}
              title={showBoth ? 'Cost' : undefined}
              captions={
                maximized
                  ? keys.map((key, index) => (
                      <span key={`ccap-${key}`} className="text-amber-600">
                        {formatScheduleMoney(cost.cumulative[index], cost.currency)}
                      </span>
                    ))
                  : undefined
              }
              renderBar={(index) => {
                const monthly = cost.monthly[index] ?? 0
                if (monthly <= 0) return null
                return (
                  <div
                    className="absolute inset-x-0 bottom-0 rounded-sm bg-amber-500/35"
                    style={{ height: `${(monthly / costPeak) * 100}%` }}
                  />
                )
              }}
              overlay={keys.length > 0 ? <CostLine curve={cost} playhead={playhead} /> : null}
            />
          ) : null}
        </div>
      </div>
    </div>
  )
}

function ChartPlot({
  keys,
  labels,
  simDate,
  onSeek,
  maximized,
  showLabels,
  playhead,
  title,
  captions,
  renderBar,
  overlay,
  offKeys,
}: {
  keys: string[]
  labels: string[]
  simDate: Date | null
  onSeek: (date: Date) => void
  maximized: boolean
  showLabels: boolean
  playhead: number | null
  title?: string
  captions?: ReactNode[]
  renderBar: (index: number) => ReactNode
  overlay?: ReactNode
  offKeys?: Set<string>
}) {
  const columns = { gridTemplateColumns: `repeat(${Math.max(1, keys.length)}, minmax(0, 1fr))` }
  const active = simDate ? histogramMonthIndex(keys, simDate) : null
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {title ? <p className="h-4 shrink-0 text-[10px] font-medium text-muted-foreground">{title}</p> : null}
      {maximized && captions ? (
        <div className="grid h-8 shrink-0" style={columns}>
          {keys.map((key, index) => (
            <span key={`cap-${key}`} className="px-0.5 text-center font-mono text-[10px] leading-4 text-foreground">
              {captions[index]}
            </span>
          ))}
        </div>
      ) : null}
      <div className="relative min-h-0 flex-1">
        <div className="absolute inset-0 z-0 grid" style={columns}>
          {keys.map((key, index) => {
            const future = simDate != null && isFutureMonth(key, simDate)
            const off = offKeys?.has(key) === true
            return (
              <button
                key={key}
                type="button"
                className={cn(
                  'flex h-full min-w-0 flex-col transition-[filter,opacity] duration-200',
                  future && 'opacity-30 blur-[2.5px] saturate-50',
                  active === index && 'opacity-100',
                )}
                title={off ? `${labels[index]} (non-working)` : labels[index]}
                onClick={() => {
                  const date = fromBucketKey(key)
                  if (date) onSeek(date)
                }}
              >
                <div className="relative min-h-0 w-full flex-1 px-0.5">
                  <div
                    className={cn(
                      'relative h-full w-full rounded-sm',
                      off ? 'bg-muted/80 bg-[repeating-linear-gradient(-45deg,transparent,transparent_3px,rgba(0,0,0,0.06)_3px,rgba(0,0,0,0.06)_4px)]' : 'bg-muted/50',
                    )}
                  >
                    {renderBar(index)}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
        {overlay}
        {playhead != null ? (
          <div
            className="pointer-events-none absolute top-0 bottom-0 z-10 w-0.5 bg-amber-500"
            style={{ left: `${playhead}%` }}
          />
        ) : null}
      </div>
      {showLabels ? (
        <div className="mt-1 grid h-4 shrink-0" style={columns}>
          {keys.map((key, index) => (
            <span
              key={`lbl-${key}`}
              className={cn(
                'truncate px-0.5 text-center text-[9px]',
                offKeys?.has(key) ? 'text-muted-foreground/70 line-through' : 'text-muted-foreground',
              )}
            >
              {maximized ? labels[index] : labels[index]?.replace(/\s\d{4}$/, '')}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}
