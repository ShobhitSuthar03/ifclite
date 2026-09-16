import { useMemo, useState } from 'react'
import { IfcTypeEnum } from '@ifc-lite/data'
import { Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { PropertyValueTree } from '@/components/property-value-tree'
import { groupingCatalog, type PropertyCatalogSet } from '@/lib/bim-sql'
import type { SpatialTreeNode } from '@/lib/ifc-data'
import { EMPTY_QUERY, TYPE_OPTIONS, type QuerySpec, type TypeScope } from '@/lib/ifc-query'
import { propertyRefKey, samePropertyRef, type PropertyRef, type PropertyTreeNode } from '@/lib/property-tree'
import { cn, formatCount } from '@/lib/utils'

const fieldClass =
  'h-8 w-full rounded border border-border bg-background px-2 text-xs text-foreground outline-none focus-visible:border-primary disabled:opacity-50'

type FilterBarProps = {
  ready: boolean
  hint?: string | null
  spatialRoot: SpatialTreeNode | null
  catalog: PropertyCatalogSet[]
  spec: QuerySpec
  selectedProperty: PropertyRef | null
  valueTree: PropertyTreeNode[]
  selectedKey: string | null
  matchCount: number | null
  error: string | null
  onChange: (spec: QuerySpec) => void
  onSelectProperty: (ref: PropertyRef | null) => void
  onSelectValue: (node: PropertyTreeNode | null) => void
}

export function FilterBar({
  ready,
  hint,
  spatialRoot,
  catalog,
  spec,
  selectedProperty,
  valueTree,
  selectedKey,
  matchCount,
  error,
  onChange,
  onSelectProperty,
  onSelectValue,
}: FilterBarProps) {
  const [search, setSearch] = useState('')
  const storeys = spatialRoot ? flattenStoreys(spatialRoot) : []
  const disabled = !ready
  const groups = useMemo(() => groupingCatalog(catalog, search), [catalog, search])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-2 border-b border-border p-3">
        <p className="text-[11px] text-muted-foreground">
          Unique properties from this model. Pick a property, then click a value to select those elements.
        </p>
        {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
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
      </div>
      <div className="grid min-h-0 flex-1 grid-rows-2">
        <ScrollArea className="min-h-0 border-b border-border">
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
                  const active = selectedProperty ? samePropertyRef(selectedProperty, ref) : false
                  return (
                    <button
                      key={propertyRefKey(ref)}
                      type="button"
                      disabled={disabled}
                      className={cn(
                        'flex w-full px-3 py-1 text-left text-[13px] hover:bg-accent disabled:opacity-40',
                        active && 'bg-primary/20',
                      )}
                      onClick={() => onSelectProperty(active ? null : ref)}
                    >
                      {name}
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </ScrollArea>
        <ScrollArea className="min-h-0">
          {!selectedProperty ? (
            <p className="px-3 py-6 text-xs text-muted-foreground">Choose a property to list its unique values.</p>
          ) : valueTree.length === 0 ? (
            <p className="px-3 py-6 text-xs text-muted-foreground italic">No values in this scope.</p>
          ) : (
            <PropertyValueTree
              nodes={valueTree}
              selectedKey={selectedKey}
              onSelect={(node) => onSelectValue(selectedKey === node.key ? null : node)}
            />
          )}
        </ScrollArea>
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2">
        <p className="text-[11px] text-muted-foreground">
          {matchCount != null ? `${formatCount(matchCount)} selected` : 'Click a value to select'}
        </p>
        <Button
          variant="ghost"
          size="sm"
          disabled={disabled}
          onClick={() => {
            onChange(EMPTY_QUERY)
            onSelectProperty(null)
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
