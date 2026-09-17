import { BarChart3 } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn, formatCount } from '@/lib/utils'
import {
  GROUP_BY_OPTIONS,
  METRIC_OPTIONS,
  REPORT_TEMPLATES,
  type FilterOptions,
  type GroupByField,
  type MetricField,
  type ReportFilter,
  type ReportTemplate,
} from '@/lib/bim-sql'

type ReportsPanelProps = {
  ready: boolean
  busy: boolean
  progress?: { done: number; total: number } | null
  template: ReportTemplate
  groupBy: GroupByField
  metrics: MetricField[]
  filter: ReportFilter
  options: FilterOptions | null
  followViewer: boolean
  onTemplate: (template: ReportTemplate) => void
  onGroupBy: (groupBy: GroupByField) => void
  onMetrics: (metrics: MetricField[]) => void
  onFilter: (filter: ReportFilter) => void
  onFollowViewer: (follow: boolean) => void
}

const fieldClass =
  'h-8 w-full rounded border border-border bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring'

export function ReportsPanel({
  ready,
  busy,
  progress,
  template,
  groupBy,
  metrics,
  filter,
  options,
  followViewer,
  onTemplate,
  onGroupBy,
  onMetrics,
  onFilter,
  onFollowViewer,
}: ReportsPanelProps) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-start gap-2 border-b border-border bg-muted/40 p-3">
        <BarChart3 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0">
          <p className="text-[13px] font-semibold">Reports</p>
          <p className="text-[11px] text-muted-foreground">
            Pick a template when you want a report. Building it does not freeze 3D.
          </p>
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-3 p-3">
          {busy ? (
            <div className="rounded border border-border bg-muted/40 p-2">
              <p className="text-xs font-medium text-foreground">Creating report…</p>
              <p className="text-[11px] text-muted-foreground">
                {progress && progress.total > 0
                  ? `${formatCount(progress.done)} / ${formatCount(progress.total)} elements`
                  : 'Starting the warehouse…'}
              </p>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded bg-background">
                <div
                  className="h-full bg-primary transition-[width] duration-150"
                  style={{
                    width:
                      progress && progress.total > 0
                        ? `${Math.max(4, Math.round((100 * progress.done) / progress.total))}%`
                        : '12%',
                  }}
                />
              </div>
            </div>
          ) : !ready ? (
            <p className="text-xs text-muted-foreground italic">Load an IFC model to create a report.</p>
          ) : (
            <p className="text-xs text-muted-foreground italic">Pick a template to create the report.</p>
          )}
          <section>
            <p className="mb-1 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">Templates</p>
            <div className="space-y-1">
              {REPORT_TEMPLATES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  disabled={!ready || busy}
                  className={cn(
                    'w-full rounded px-2 py-1.5 text-left hover:bg-accent disabled:opacity-40',
                    template === item.id && 'bg-primary/15',
                  )}
                  onClick={() => onTemplate(item.id)}
                >
                  <span className="block text-[13px]">{item.label}</span>
                  <span className="block text-[10px] text-muted-foreground">{item.hint}</span>
                </button>
              ))}
            </div>
          </section>
          <label className="flex items-center gap-2 text-[12px]">
            <input
              type="checkbox"
              checked={followViewer}
              onChange={(event) => onFollowViewer(event.target.checked)}
            />
            Filter report to 3D selection
          </label>
          <FilterSelect
            label="Level / storey"
            value={filter.storey}
            options={options?.storeys ?? []}
            onChange={(storey) => onFilter({ ...filter, storey })}
          />
          <FilterSelect
            label="Category"
            value={filter.category}
            options={options?.categories ?? []}
            onChange={(category) => onFilter({ ...filter, category })}
          />
          <FilterSelect
            label="Cost code"
            value={filter.costCode}
            options={options?.costCodes ?? []}
            onChange={(costCode) => onFilter({ ...filter, costCode })}
          />
          <FilterSelect
            label="Phase"
            value={filter.phase}
            options={options?.phases ?? []}
            onChange={(phase) => onFilter({ ...filter, phase })}
          />
          <FilterSelect
            label="4D status"
            value={filter.status}
            options={options?.statuses ?? []}
            onChange={(status) => onFilter({ ...filter, status })}
          />
          {(template === 'qto' || template === 'cost' || template === 'custom') && (
            <label className="block text-[12px]">
              <span className="mb-1 block text-muted-foreground">Group by</span>
              <select className={fieldClass} value={groupBy} onChange={(event) => onGroupBy(event.target.value as GroupByField)}>
                {GROUP_BY_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          {template === 'custom' ? (
            <fieldset className="space-y-1">
              <legend className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">Metrics</legend>
              {METRIC_OPTIONS.map((item) => {
                const checked = metrics.includes(item.value)
                return (
                  <label key={item.value} className="flex items-center gap-2 text-[12px]">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        const next = checked ? metrics.filter((metric) => metric !== item.value) : [...metrics, item.value]
                        onMetrics(next.length > 0 ? next : ['count'])
                      }}
                    />
                    {item.label}
                  </label>
                )
              })}
            </fieldset>
          ) : null}
        </div>
      </ScrollArea>
    </div>
  )
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string | null
  options: string[]
  onChange: (value: string | null) => void
}) {
  return (
    <label className="block text-[12px]">
      <span className="mb-1 block text-muted-foreground">{label}</span>
      <select
        className={fieldClass}
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value || null)}
      >
        <option value="">All</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  )
}
