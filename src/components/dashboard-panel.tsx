import { LayoutDashboard } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn, formatCount } from '@/lib/utils'
import type { ReportResult, ReportRow } from '@/lib/bim-sql'

type DashboardPanelProps = {
  result: ReportResult | null
  busy: boolean
  followViewer: boolean
  chartMetric: string
  onRowClick: (row: ReportRow) => void
  onExport: (format: 'csv' | 'json' | 'xlsx') => void
}

export function DashboardPanel({
  result,
  busy,
  followViewer,
  chartMetric,
  onRowClick,
  onExport,
}: DashboardPanelProps) {
  if (busy) {
    return <p className="px-3 py-6 text-xs text-muted-foreground">Querying the BIM warehouse…</p>
  }
  if (!result) {
    return (
      <p className="px-3 py-6 text-xs text-muted-foreground">
        Open the Reports tab, pick a template, and the KPIs, chart, and table appear here. Click a row to isolate those
        elements in 3D.
      </p>
    )
  }
  const max = Math.max(
    0,
    ...result.rows.map((row) => {
      const value = row.values[chartMetric]
      return typeof value === 'number' ? value : 0
    }),
  )
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-start gap-2 border-b border-border p-3">
        <LayoutDashboard className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold">{result.title}</p>
          <p className="text-[11px] text-muted-foreground">
            {formatCount(result.elementCount)} scoped elements
            {followViewer ? ' · filtered to 3D selection' : ''}
          </p>
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-3 p-3">
          <div className="grid grid-cols-2 gap-2">
            {result.kpis.map((item) => (
              <div key={item.label} className="rounded border border-border bg-muted/40 p-2">
                <p className="text-[10px] text-muted-foreground">{item.label}</p>
                <p
                  className={cn(
                    'text-[15px] font-semibold',
                    item.tone === 'warn' && 'text-destructive',
                    item.tone === 'ok' && 'text-primary',
                  )}
                >
                  {item.value}
                </p>
                {item.hint ? <p className="text-[10px] text-muted-foreground">{item.hint}</p> : null}
              </div>
            ))}
          </div>
          <div className="space-y-1">
            {result.rows.map((row) => {
              const raw = row.values[chartMetric]
              const value = typeof raw === 'number' ? raw : 0
              const width = max > 0 ? Math.max(4, (100 * value) / max) : 0
              return (
                <button
                  key={row.key}
                  type="button"
                  className="block w-full rounded px-1 py-0.5 text-left hover:bg-accent"
                  onClick={() => onRowClick(row)}
                  title="Isolate these elements in 3D"
                >
                  <div className="flex justify-between gap-2 text-[11px]">
                    <span className="min-w-0 truncate">{row.label}</span>
                    <span className="shrink-0 font-mono text-muted-foreground">
                      {typeof raw === 'number' ? raw.toFixed(raw >= 100 ? 0 : 2) : String(raw ?? '')}
                    </span>
                  </div>
                  <div className="mt-0.5 h-1.5 overflow-hidden rounded bg-secondary">
                    <div className="h-full bg-primary" style={{ width: `${width}%` }} />
                  </div>
                </button>
              )
            })}
          </div>
          <div className="overflow-x-auto rounded border border-border">
            <table className="w-full text-[11px]">
              <thead className="bg-muted">
                <tr>
                  {result.columns.map((column) => (
                    <th key={column.key} className="px-2 py-1.5 text-left font-semibold">
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row) => (
                  <tr
                    key={row.key}
                    className="cursor-pointer border-t border-border hover:bg-accent"
                    onClick={() => onRowClick(row)}
                  >
                    {result.columns.map((column) => {
                      const value = column.key === 'label' ? row.label : row.values[column.key]
                      const text =
                        typeof value === 'number'
                          ? column.kind === 'percent'
                            ? `${value.toFixed(1)}%`
                            : Number.isInteger(value)
                              ? String(value)
                              : value.toFixed(3)
                          : String(value ?? '')
                      return (
                        <td key={column.key} className="px-2 py-1 font-mono">
                          {text}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-1">
            <Button size="sm" variant="outline" onClick={() => onExport('xlsx')}>
              Excel
            </Button>
            <Button size="sm" variant="outline" onClick={() => onExport('csv')}>
              CSV
            </Button>
            <Button size="sm" variant="outline" onClick={() => onExport('json')}>
              JSON
            </Button>
          </div>
        </div>
      </ScrollArea>
    </div>
  )
}
