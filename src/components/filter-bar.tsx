import { useMemo, useState } from 'react'
import { IfcTypeEnum } from '@ifc-lite/data'
import { Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { BreakdownRuleList } from '@/components/breakdown-rule-list'
import { PropertyValueTree } from '@/components/property-value-tree'
import { groupingCatalog, type PropertyCatalogSet } from '@/lib/bim-sql'
import type { SpatialTreeNode } from '@/lib/ifc-data'
import { EMPTY_QUERY, TYPE_OPTIONS, type QuerySpec, type TypeScope } from '@/lib/ifc-query'
import {
  MAX_FILTER_RULES,
  addFilterRule,
  promoteFilterRule,
  propertyRefKey,
  samePropertyRef,
  type PropertyRef,
  type PropertyTreeNode,
} from '@/lib/property-tree'
import { isAdditiveModifier } from '@/lib/selection'
import { cn, formatCount } from '@/lib/utils'

const fieldClass =
  'h-8 w-full rounded border border-border bg-background px-2 text-xs text-foreground outline-none focus-visible:border-primary disabled:opacity-50'

type FilterBarProps = {
  ready: boolean
  hint?: string | null
  intro?: string
  spatialRoot: SpatialTreeNode | null
  catalog: PropertyCatalogSet[]
  spec: QuerySpec
  rules: PropertyRef[]
  valueTree: PropertyTreeNode[]
  selectedKeys: string[]
  matchCount: number | null
  error: string | null
  onChange: (spec: QuerySpec) => void
  onRulesChange: (rules: PropertyRef[]) => void
  onSelectValue: (node: PropertyTreeNode | null, additive?: boolean) => void
  colorize: boolean
  onColorizeChange: (colorize: boolean) => void
  showColorize?: boolean
  multiSelect?: boolean
}

export function FilterBar({
  ready,
  hint,
  intro,
  spatialRoot,
  catalog,
  spec,
  rules,
  valueTree,
  selectedKeys,
  matchCount,
  error,
  onChange,
  onRulesChange,
  onSelectValue,
  colorize,
  onColorizeChange,
  showColorize = true,
  multiSelect = false,
}: FilterBarProps) {
  const [search, setSearch] = useState('')
  const storeys = spatialRoot ? flattenStoreys(spatialRoot) : []
  const disabled = !ready
  const groups = useMemo(() => groupingCatalog(catalog, search), [catalog, search])
  const full = rules.length >= MAX_FILTER_RULES

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-2 border-b border-border p-3">
        {rules.length === 0 ? (
          <>
            <p className="text-[11px] text-muted-foreground">
              {intro ??
                'Pick properties to build a breakdown. Click a used property or use the arrows to change order — the value list follows Group, then Then.'}
            </p>
            {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
          </>
        ) : null}
        <div className="grid grid-cols-2 gap-1.5">
          <select
            className={fieldClass}
            disabled={disabled}
            value={spec.typeScope}
            onChange={(event) => onChange({ ...spec, typeScope: event.target.value as TypeScope, clauses: [] })}
          >
            {TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <select
            className={fieldClass}
            disabled={disabled}
            value={spec.storeyId ?? ''}
            onChange={(event) =>
              onChange({
                ...spec,
                storeyId: event.target.value === '' ? null : Number(event.target.value),
                clauses: [],
              })
            }
          >
            <option value="">All storeys</option>
            {storeys.map((storey) => (
              <option key={storey.id} value={storey.id}>
                {storey.name}
              </option>
            ))}
          </select>
        </div>
        <label className="relative block">
          <Search className="pointer-events-none absolute top-2 left-2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            className={cn(fieldClass, 'pl-7')}
            disabled={disabled}
            value={search}
            placeholder="Search properties"
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <BreakdownRuleList rules={rules} disabled={disabled} onChange={onRulesChange} />
      </div>
      <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="flex min-h-0 flex-col border-b border-border">
          <div className="flex h-8 shrink-0 items-center border-b border-border bg-muted/40 px-3">
            <span className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">Properties</span>
          </div>
          <ScrollArea className="min-h-0 flex-1">
            {groups.length === 0 ? (
              <p className="px-3 py-6 text-xs text-muted-foreground italic">No properties match.</p>
            ) : (
              groups.map((group) => (
                <div key={`${group.kind}:${group.set}`} className="py-1">
                  <p className="px-3 py-1 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                    {group.set}
                  </p>
                  {group.names.map((name) => {
                    const ref: PropertyRef = { set: group.set, name, kind: group.kind }
                    const usedIndex = rules.findIndex((rule) => samePropertyRef(rule, ref))
                    const used = usedIndex >= 0
                    return (
                      <button
                        key={propertyRefKey(ref)}
                        type="button"
                        disabled={disabled || (!used && full)}
                        className={cn(
                          'flex w-full items-center gap-2 px-3 py-1 text-left text-[13px] hover:bg-accent disabled:opacity-40',
                          used && 'bg-primary/15',
                        )}
                        onClick={() => {
                          if (used) {
                            const next = promoteFilterRule(rules, ref)
                            if (next === rules) return
                            onRulesChange(next)
                            return
                          }
                          onRulesChange(addFilterRule(rules, ref))
                        }}
                      >
                        {used ? (
                          <span className="w-4 shrink-0 text-[10px] font-semibold text-muted-foreground">
                            {usedIndex + 1}
                          </span>
                        ) : (
                          <span className="w-4 shrink-0" />
                        )}
                        <span className="truncate">{name}</span>
                      </button>
                    )
                  })}
                </div>
              ))
            )}
          </ScrollArea>
        </div>
        <div className="h-full min-h-0 overflow-hidden">
          {rules.length === 0 ? (
            <PropertyValueTree
              nodes={[]}
              selectedKeys={[]}
              emptyText="Pick a property to create a breakdown. Then pick a second property to nest unique values."
              onSelect={() => undefined}
            />
          ) : (
            <PropertyValueTree
              nodes={valueTree}
              selectedKeys={selectedKeys}
              levels={rules.map((rule) => rule.name)}
              emptyText="No values in this scope."
              onSelect={(node, event) => {
                const additive = multiSelect || isAdditiveModifier(event)
                if (!additive && selectedKeys.length === 1 && selectedKeys[0] === node.key) {
                  onSelectValue(null)
                  return
                }
                onSelectValue(node, additive)
              }}
            />
          )}
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2">
        {showColorize ? (
          <label className={cn('flex items-center gap-1.5 text-[11px]', disabled && 'opacity-50')}>
            <input
              type="checkbox"
              disabled={disabled}
              checked={colorize}
              onChange={(event) => onColorizeChange(event.target.checked)}
            />
            Color 3D
          </label>
        ) : (
          <span className="text-[11px] text-muted-foreground">Property or 3D</span>
        )}
        <p className="text-[11px] text-muted-foreground">
          {matchCount != null
            ? `${formatCount(matchCount)} selected`
            : rules.length === 0
              ? 'Pick a property to group unique values'
              : multiSelect
                ? 'Click values to combine them'
                : 'Click a value · Ctrl-click to add'}
        </p>
        <Button
          variant="ghost"
          size="sm"
          disabled={disabled}
          onClick={() => {
            onChange(EMPTY_QUERY)
            onRulesChange([])
            onSelectValue(null)
          }}
        >
          Clear
        </Button>
      </div>
      {error ? <p className="px-3 pb-2 text-[11px] text-destructive">{error}</p> : null}
    </div>
  )
}

function flattenStoreys(root: SpatialTreeNode): Array<{ id: number; name: string }> {
  const rows: Array<{ id: number; name: string }> = []
  const walk = (node: SpatialTreeNode) => {
    if (node.type === IfcTypeEnum.IfcBuildingStorey) {
      rows.push({ id: node.expressId, name: node.name || `Storey #${node.expressId}` })
    }
    for (const child of node.children) walk(child)
  }
  walk(root)
  return rows
}
