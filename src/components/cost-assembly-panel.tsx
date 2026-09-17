import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, FolderOpen, RefreshCw, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type {
  AssemblyParameter,
  CostAssembly,
  CostAssemblyCatalog,
  CostKind,
} from '@/lib/cost-assembly/types'
import { displayText, englishHint } from '@/lib/cost-assembly/types'
import {
  COST_KIND_LABEL,
  COST_KIND_SHORT,
  filterDivisionTree,
  formatAssemblyMoney,
  formatAssemblyQty,
  formatAssemblyUnit,
  formatHours,
} from '@/lib/cost-assembly/search'
import { buildUpRows, type BuildUpRow } from '@/lib/cost-assembly/build-up'
import { cn, formatCount } from '@/lib/utils'

type CostAssemblyPanelProps = {
  catalog: CostAssemblyCatalog | null
  loading: boolean
  error: string | null
  selectedId: string | null
  onSelect: (assembly: CostAssembly) => void
  onReload: () => void
  onOpenFile: () => void
}

const KIND_TONE: Record<CostKind, string> = {
  labor: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
  material: 'bg-amber-500/15 text-amber-800 dark:text-amber-300',
  equipment: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
  subcontractor: 'bg-teal-500/15 text-teal-700 dark:text-teal-300',
  other: 'bg-muted text-muted-foreground',
}

const COLS = 'grid-cols-[6.5rem_minmax(0,1fr)_3.25rem_6.25rem]'
const BUILD_COLS = 'grid-cols-[5.75rem_minmax(0,1fr)_2.25rem_3.25rem_3.25rem_5.75rem_6.25rem]'

export function CostAssemblyPanel({
  catalog,
  loading,
  error,
  selectedId,
  onSelect,
  onReload,
  onOpenFile,
}: CostAssemblyPanelProps) {
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const tree = useMemo(
    () => (catalog ? filterDivisionTree(catalog.root, query) : []),
    [catalog, query],
  )

  useEffect(() => {
    if (!catalog) return
    setExpanded(new Set(collectDivisionIds(catalog.root)))
  }, [catalog])

  const selected = catalog?.assemblies.find((item) => item.id === selectedId) ?? null

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-border px-2">
        <p className="shrink-0 text-[12px] font-medium">Assemblies</p>
        {catalog ? (
          <span className="font-mono text-[10px] text-muted-foreground">{formatCount(catalog.assemblies.length)}</span>
        ) : null}
        <label className="flex h-6 min-w-[12rem] flex-1 items-center gap-1.5 rounded border border-border bg-background px-2">
          <Search className="h-3 w-3 shrink-0 text-muted-foreground" />
          <input
            className="min-w-0 flex-1 bg-transparent text-[11px] text-foreground outline-none"
            placeholder="Code, description or resource..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]" onClick={onReload} disabled={loading}>
          <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} />
          Reload
        </Button>
        <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]" onClick={onOpenFile}>
          <FolderOpen className="h-3 w-3" />
          Open
        </Button>
      </div>
      {error ? (
        <p className="shrink-0 border-b border-border px-2 py-1 text-[11px] text-destructive">{error}</p>
      ) : null}
      {loading && !catalog ? (
        <p className="px-3 py-6 text-xs text-muted-foreground italic">Reading cost assembly catalog...</p>
      ) : !catalog ? (
        <div className="flex flex-1 flex-col items-start justify-center gap-2 px-3">
          <p className="text-xs text-muted-foreground">No assembly catalog loaded.</p>
          <Button size="sm" onClick={onOpenFile}>
            Open catalog
          </Button>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <div className="min-h-0 w-[46%] min-w-[22rem] overflow-auto border-r border-border">
            <div
              className={cn(
                'sticky top-0 z-10 grid border-b border-border bg-card px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground',
                COLS,
              )}
            >
              <span>Code</span>
              <span>Description</span>
              <span className="text-right">Unit</span>
              <span className="text-right">Rate</span>
            </div>
            {tree.map((node) => (
              <DivisionBlock
                key={node.id}
                node={node}
                depth={0}
                expanded={expanded}
                selectedId={selectedId}
                onToggle={(id) => {
                  setExpanded((current) => {
                    const next = new Set(current)
                    if (next.has(id)) next.delete(id)
                    else next.add(id)
                    return next
                  })
                }}
                onSelect={onSelect}
              />
            ))}
          </div>
          <div className="min-h-0 min-w-0 flex-1 overflow-auto">
            {selected ? <AssemblyDetail assembly={selected} /> : <CatalogOverview catalog={catalog} />}
          </div>
        </div>
      )}
    </div>
  )
}

function collectDivisionIds(nodes: CostAssemblyCatalog['root']): string[] {
  const ids: string[] = []
  const walk = (node: CostAssemblyCatalog['root'][number]) => {
    ids.push(node.id)
    for (const child of node.children) walk(child)
  }
  for (const node of nodes) walk(node)
  return ids
}

function DivisionBlock({
  node,
  depth,
  expanded,
  selectedId,
  onToggle,
  onSelect,
}: {
  node: CostAssemblyCatalog['root'][number]
  depth: number
  expanded: Set<string>
  selectedId: string | null
  onToggle: (id: string) => void
  onSelect: (assembly: CostAssembly) => void
}) {
  const open = expanded.has(node.id)
  return (
    <div>
      <button
        type="button"
        className={cn('grid h-7 w-full items-center px-2 text-left text-[11px] hover:bg-accent', COLS)}
        onClick={() => onToggle(node.id)}
      >
        <span className="flex min-w-0 items-center gap-1 font-mono text-[10px] text-muted-foreground" style={{ paddingLeft: depth * 12 }}>
          {open ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
          <span className="truncate">{node.code}</span>
        </span>
        <span className="min-w-0 truncate font-medium">{englishHint(node.description) || displayText(node.description)}</span>
        <span />
        <span />
      </button>
      {open
        ? node.children.map((child) => (
            <DivisionBlock
              key={child.id}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              selectedId={selectedId}
              onToggle={onToggle}
              onSelect={onSelect}
            />
          ))
        : null}
      {open
        ? node.assemblies.map((assembly) => (
            <button
              key={assembly.id}
              type="button"
              className={cn(
                'grid h-8 w-full items-center px-2 text-left text-[11px] hover:bg-accent',
                COLS,
                selectedId === assembly.id && 'bg-primary/10',
              )}
              onClick={() => onSelect(assembly)}
            >
              <span className="truncate font-mono text-[10px] text-muted-foreground" style={{ paddingLeft: 16 + depth * 12 }}>
                {assembly.code}
              </span>
              <span className="min-w-0 truncate" title={displayText(assembly.description)}>
                {englishHint(assembly.description) || displayText(assembly.description)}
              </span>
              <span className="text-right text-[10px] text-muted-foreground">{formatAssemblyUnit(assembly.uom)}</span>
              <span className="text-right font-mono text-[11px] tabular-nums">
                {formatAssemblyMoney(assembly.costs, assembly.currency)}
              </span>
            </button>
          ))
        : null}
    </div>
  )
}

function CatalogOverview({ catalog }: { catalog: CostAssemblyCatalog }) {
  const currency = catalog.assemblies[0]?.currency ?? 'EUR'
  return (
    <div className="flex h-full flex-col justify-center gap-2 px-6 text-[12px] text-muted-foreground">
      <p className="text-[13px] font-medium text-foreground">{catalog.catalogDescription || catalog.catalogName}</p>
      <p>
        {formatCount(catalog.assemblies.length)} assemblies · {currency} unit rates
      </p>
      <p>Select an assembly to open the cost build-up (labor, material, plant).</p>
      <p>Assign assemblies to a BOQ in the Estimation tab.</p>
    </div>
  )
}

function AssemblyDetail({ assembly }: { assembly: CostAssembly }) {
  const title = englishHint(assembly.description) || displayText(assembly.description)
  const local = localHint(assembly.description)
  const kinds: Array<[CostKind, number]> = [
    ['labor', assembly.labor],
    ['material', assembly.material],
    ['equipment', assembly.equipment],
    ['subcontractor', assembly.subcontractor],
    ['other', assembly.other],
  ]
  const rows = useMemo(() => buildUpRows(assembly.details), [assembly])
  const groupIds = useMemo(
    () => rows.filter((row) => row.hasChildren).map((row) => row.id),
    [rows],
  )
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(groupIds))

  useEffect(() => {
    setExpanded(new Set(rows.filter((row) => row.hasChildren).map((row) => row.id)))
  }, [assembly.id, rows])

  const visible = useMemo(() => {
    const hidden = new Set<string>()
    const out: BuildUpRow[] = []
    for (const row of rows) {
      if (row.parentId && hidden.has(row.parentId)) {
        hidden.add(row.id)
        continue
      }
      if (row.parentId && !expanded.has(row.parentId)) {
        hidden.add(row.id)
        continue
      }
      out.push(row)
    }
    return out
  }, [rows, expanded])

  const toggle = (id: string) => {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="flex min-h-full flex-col">
      <div className="border-b border-border px-3 py-2">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="font-mono text-[12px] font-medium">{assembly.code}</span>
          <span className="text-[12px] font-medium">{title}</span>
        </div>
        {local && local !== title ? <p className="text-[11px] text-muted-foreground">{local}</p> : null}
        <p className="mt-0.5 text-[10px] text-muted-foreground">{assembly.path.map(formatGroup).join('  /  ')}</p>
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          <Kpi label="Unit rate" value={formatAssemblyMoney(assembly.costs, assembly.currency)} hint={`per ${formatAssemblyUnit(assembly.uom)}`} />
          <Kpi label="Labour hours" value={formatHours(assembly.hours)} hint={`per ${formatAssemblyUnit(assembly.uom)}`} />
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {kinds.map(([kind, amount]) =>
            amount > 0 ? (
              <span key={kind} className={cn('rounded px-1.5 py-0.5 text-[10px] font-medium', KIND_TONE[kind])}>
                {COST_KIND_LABEL[kind]} {formatAssemblyMoney(amount, assembly.currency)}
              </span>
            ) : null,
          )}
        </div>
      </div>
      {assembly.parameters.length > 0 ? (
        <div className="border-b border-border px-3 py-2">
          <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Factors</p>
          <ParameterTable parameters={assembly.parameters} />
        </div>
      ) : null}
      <div className="min-h-0 flex-1 px-3 py-2">
        <div className="mb-1 flex items-center gap-2">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Cost build-up</p>
          <span className="flex-1" />
          <button
            type="button"
            className="h-5 px-1.5 text-[10px] text-muted-foreground hover:text-foreground"
            onClick={() => setExpanded(new Set(groupIds))}
          >
            Expand all
          </button>
          <button
            type="button"
            className="h-5 px-1.5 text-[10px] text-muted-foreground hover:text-foreground"
            onClick={() => setExpanded(new Set())}
          >
            Collapse all
          </button>
        </div>
        <div className={cn('grid px-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground', BUILD_COLS)}>
          <span>Item</span>
          <span>Description</span>
          <span>Type</span>
          <span className="text-right">Qty</span>
          <span className="text-right">Unit</span>
          <span className="text-right">Rate</span>
          <span className="text-right">Amount</span>
        </div>
        {visible.map((row) => {
          const open = expanded.has(row.id)
          return row.hasChildren ? (
            <button
              key={row.id}
              type="button"
              className={cn(
                'grid w-full items-start border-t border-border/70 px-1 py-1 text-left text-[11px] hover:bg-accent',
                BUILD_COLS,
                'bg-muted/40 font-medium',
                row.muted && 'text-muted-foreground',
              )}
              onClick={() => toggle(row.id)}
            >
              <span className="flex min-w-0 items-center gap-0.5 font-mono text-[10px]" style={{ paddingLeft: row.indent * 10 }}>
                {open ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
                <span className="truncate" title={row.code}>{row.code}</span>
              </span>
              <span className="min-w-0 leading-4">{row.description}</span>
              <span />
              <span className="text-right tabular-nums">{row.qty == null ? '' : formatAssemblyQty(row.qty)}</span>
              <span className="text-right text-muted-foreground">{row.unit ? formatAssemblyUnit(row.unit) : ''}</span>
              <span />
              <span className="text-right font-mono tabular-nums">
                {row.amount == null ? '' : formatAssemblyMoney(row.amount, assembly.currency)}
              </span>
            </button>
          ) : (
            <div
              key={row.id}
              className={cn(
                'grid items-start border-t border-border/70 px-1 py-1 text-[11px]',
                BUILD_COLS,
                row.muted && 'text-muted-foreground',
              )}
            >
              <span className="truncate font-mono text-[10px]" style={{ paddingLeft: 14 + row.indent * 10 }} title={row.code}>
                {row.code}
              </span>
              <span className="min-w-0 leading-4">
                {row.description}
                {row.note ? <span className="mt-0.5 block text-[10px] font-normal text-muted-foreground">{row.note}</span> : null}
                {row.factor !== 1 ? (
                  <span className="mt-0.5 block text-[10px] font-normal text-muted-foreground">
                    Factor {formatAssemblyQty(row.factor)}
                  </span>
                ) : null}
              </span>
              <span>
                {row.kind !== 'group' ? (
                  <span className={cn('inline-flex rounded px-1 text-[10px] font-medium', KIND_TONE[row.kind])}>
                    {COST_KIND_SHORT[row.kind]}
                  </span>
                ) : null}
              </span>
              <span className="text-right tabular-nums">{row.qty == null ? '' : formatAssemblyQty(row.qty)}</span>
              <span className="text-right text-muted-foreground">{row.unit ? formatAssemblyUnit(row.unit) : ''}</span>
              <span className="text-right tabular-nums">
                {row.rate == null ? '' : formatAssemblyMoney(row.rate, assembly.currency)}
              </span>
              <span className="text-right font-mono tabular-nums">
                {row.amount == null ? '' : formatAssemblyMoney(row.amount, assembly.currency)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ParameterTable({ parameters }: { parameters: AssemblyParameter[] }) {
  return (
    <div className="grid grid-cols-[8rem_minmax(0,1fr)_3.5rem_minmax(6rem,1fr)] gap-x-2 text-[11px]">
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Code</span>
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Description</span>
      <span className="text-right text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Unit</span>
      <span className="text-right text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Formula</span>
      {parameters.map((parameter) => (
        <div key={parameter.code} className="contents">
          <span className="truncate font-mono text-[10px]">{parameter.code}</span>
          <span className="min-w-0 truncate">{englishHint([{ language: 'en', value: parameter.description }]) || parameter.description}</span>
          <span className="text-right text-muted-foreground">{parameter.unit ? formatAssemblyUnit(parameter.unit) : ''}</span>
          <span className="truncate text-right font-mono text-[10px]">{parameter.value ?? ''}</span>
        </div>
      ))}
    </div>
  )
}

function localHint(items: { language: string; value: string }[]): string {
  const raw = displayText(items)
  const left = raw.split('|')[0]?.trim() ?? ''
  return left
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded border border-border px-2 py-1.5">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="font-mono text-[13px] font-medium tabular-nums">{value}</p>
      {hint ? <p className="text-[10px] text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

function formatGroup(code: string): string {
  return code.replace(/\.$/, '')
}
