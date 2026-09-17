import { useMemo, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { formatAssemblyMoney, formatAssemblyQty, formatAssemblyUnit } from '@/lib/cost-assembly/search'
import type { CostAssembly, CostKind } from '@/lib/cost-assembly/types'
import type { BoqNode } from '@/lib/estimation'
import type { ElementBuildUp, ElementBuildUpLine } from '@/lib/estimation/qty-bind'
import { cn } from '@/lib/utils'

type SectionId = 'LO' | 'MA' | 'ME' | 'OT'

const SECTIONS: Array<{ id: SectionId; label: string; tone: string }> = [
  { id: 'LO', label: 'LO', tone: 'border-sky-500/40 bg-sky-500/10' },
  { id: 'MA', label: 'MA', tone: 'border-amber-500/40 bg-amber-500/10' },
  { id: 'ME', label: 'ME', tone: 'border-violet-500/40 bg-violet-500/10' },
  { id: 'OT', label: 'Others', tone: 'border-border bg-muted/50' },
]

type ElementCostCardProps = {
  label: string
  node: BoqNode
  assembly: CostAssembly
  build: ElementBuildUp
}

export function ElementCostCard({ label, node, assembly, build }: ElementCostCardProps) {
  const [open, setOpen] = useState(true)
  const live = useMemo(
    () => build.lines.filter((line) => Math.abs(line.amount) >= 0.005),
    [build.lines],
  )
  const sections = useMemo(() => {
    return SECTIONS.map((section) => {
      const lines = live.filter((line) => sectionOf(line.kind) === section.id)
      return {
        ...section,
        lines,
        total: lines.reduce((sum, line) => sum + line.amount, 0),
      }
    })
  }, [live])
  const name = label.replace(/\s+#\d+$/, '')

  return (
    <div className="pointer-events-none absolute inset-x-3 bottom-3 z-20">
      <div className="pointer-events-auto overflow-hidden rounded-md border border-border/80 bg-background/90 shadow-md backdrop-blur-md">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border/70 px-3 py-1.5">
          <span className="min-w-0 truncate text-[12px] font-medium">{name}</span>
          <span className="tabular-nums text-[11px] text-muted-foreground">
            {build.measured ? formatAssemblyQty(build.volume) : '—'} m³
          </span>
          <span className="tabular-nums text-[11px] text-muted-foreground">
            {build.measured ? formatAssemblyQty(build.formwork) : '—'} m²
          </span>
          <span className="min-w-0 truncate text-[11px] text-muted-foreground">
            {node.code ? `${node.code} · ` : ''}
            {assembly.code}
            {!build.measured ? ' · calculate quantities' : ''}
          </span>
          <span className="ml-auto flex shrink-0 items-center gap-2">
            <span className="font-mono text-[13px] font-semibold tabular-nums">
              {formatAssemblyMoney(build.total, assembly.currency)}
            </span>
            <button
              type="button"
              className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              title={open ? 'Hide resources' : 'Show resources'}
              onClick={() => setOpen((value) => !value)}
            >
              {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
            </button>
          </span>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4">
          {sections.map((section, index) => (
            <div
              key={section.id}
              className={cn(
                'min-w-0 border-border/70 p-2',
                index % 2 === 1 ? 'border-l' : 'max-lg:border-l-0',
                index >= 2 ? 'border-t lg:border-t-0' : null,
                'lg:border-l lg:first:border-l-0',
                section.tone,
              )}
            >
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <span className="text-[10px] font-semibold tracking-wide">{section.label}</span>
                <span className="font-mono text-[12px] tabular-nums">
                  {formatAssemblyMoney(section.total, assembly.currency)}
                </span>
              </div>
              {open ? (
                section.lines.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground">—</p>
                ) : (
                  <div className="max-h-28 overflow-auto">
                    {section.lines.map((line) => (
                      <div key={line.rowId} className="flex items-baseline gap-2 py-px text-[11px]">
                        <span className="min-w-0 flex-1 truncate" title={line.description}>
                          {shortResourceName(line.description)}
                        </span>
                        <span className="shrink-0 tabular-nums text-muted-foreground">
                          {formatAssemblyQty(line.qty)} {formatAssemblyUnit(line.unit)}
                        </span>
                        <span className="w-[4.5rem] shrink-0 text-right font-mono tabular-nums">
                          {formatAssemblyMoney(line.amount, assembly.currency)}
                        </span>
                      </div>
                    ))}
                  </div>
                )
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function sectionOf(kind: CostKind | 'group'): SectionId {
  if (kind === 'labor') return 'LO'
  if (kind === 'material') return 'MA'
  if (kind === 'equipment') return 'ME'
  return 'OT'
}

function shortResourceName(text: string): string {
  const cut = text.split(/[,;(–-]/)[0]?.trim()
  return cut || text
}
