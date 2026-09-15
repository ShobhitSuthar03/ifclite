import { IfcTypeEnum } from '@ifc-lite/data'
import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { IfcDataStore } from '@/lib/ifc-data'
import {
  EMPTY_QUERY,
  OPERATORS,
  QUERY_PRESETS,
  TYPE_OPTIONS,
  type PropertyClause,
  type QuerySpec,
  type TypeScope,
} from '@/lib/ifc-query'
import { cn, formatCount } from '@/lib/utils'

const fieldClass =
  'h-8 w-full rounded border border-border bg-background px-2 text-xs text-foreground outline-none focus-visible:border-primary disabled:opacity-50'

type FilterBarProps = {
  store: IfcDataStore | null
  spec: QuerySpec
  matchCount: number | null
  error: string | null
  onChange: (spec: QuerySpec) => void
}

export function FilterBar({ store, spec, matchCount, error, onChange }: FilterBarProps) {
  const storeys = store?.spatialHierarchy?.project ? flattenStoreys(store) : []
  const disabled = store == null

  return (
    <div className="flex h-full min-h-0 flex-col gap-2.5 overflow-auto p-3">
      <label className="flex flex-col gap-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        Target class
        <select
          className={fieldClass}
          disabled={disabled}
          value={spec.typeScope}
          onChange={(event) => onChange({ ...spec, typeScope: event.target.value as TypeScope })}
        >
          {TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        Storey
        <select
          className={fieldClass}
          disabled={disabled}
          value={spec.storeyId ?? ''}
          onChange={(event) =>
            onChange({
              ...spec,
              storeyId: event.target.value === '' ? null : Number(event.target.value),
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
      </label>
      <label className="flex flex-col gap-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        Preset
        <select
          className={fieldClass}
          disabled={disabled}
          value=""
          onChange={(event) => {
            const preset = QUERY_PRESETS.find((item) => item.id === event.target.value)
            if (preset) onChange({ ...preset.spec, storeyId: spec.storeyId })
          }}
        >
          <option value="">Apply preset…</option>
          {QUERY_PRESETS.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.label}
            </option>
          ))}
        </select>
      </label>
      <p className="text-[11px] text-muted-foreground">
        Matching elements isolate in the viewport. Pick a type or storey before adding a property clause.
      </p>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          disabled={disabled || (spec.typeScope === 'all' && spec.storeyId == null)}
          onClick={() =>
            onChange({
              ...spec,
              clauses: [
                ...spec.clauses,
                { id: crypto.randomUUID(), pset: 'Pset_WallCommon', name: 'IsExternal', op: '=', value: 'true' },
              ],
            })
          }
        >
          <Plus />
          Property
        </Button>
        <Button variant="ghost" size="sm" disabled={disabled} onClick={() => onChange(EMPTY_QUERY)}>
          Clear
        </Button>
      </div>
      {spec.clauses.map((clause) => (
        <ClauseRow
          key={clause.id}
          clause={clause}
          disabled={disabled}
          onChange={(next) =>
            onChange({
              ...spec,
              clauses: spec.clauses.map((item) => (item.id === clause.id ? next : item)),
            })
          }
          onRemove={() => onChange({ ...spec, clauses: spec.clauses.filter((item) => item.id !== clause.id) })}
        />
      ))}
      {matchCount != null && (
        <p className="text-[11px] text-muted-foreground">
          {formatCount(matchCount)} match{matchCount === 1 ? '' : 'es'} isolated
        </p>
      )}
      {error && <p className="text-[11px] text-destructive">{error}</p>}
    </div>
  )
}

function ClauseRow({
  clause,
  disabled,
  onChange,
  onRemove,
}: {
  clause: PropertyClause
  disabled: boolean
  onChange: (clause: PropertyClause) => void
  onRemove: () => void
}) {
  return (
    <div className="rounded border border-border p-2">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Property rule</span>
        <Button variant="ghost" size="icon" className="h-6 w-6" disabled={disabled} onClick={onRemove}>
          <X />
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <input
          className={fieldClass}
          disabled={disabled}
          value={clause.pset}
          placeholder="Pset or Qto"
          onChange={(event) => onChange({ ...clause, pset: event.target.value })}
        />
        <input
          className={fieldClass}
          disabled={disabled}
          value={clause.name}
          placeholder="Property"
          onChange={(event) => onChange({ ...clause, name: event.target.value })}
        />
        <select
          className={fieldClass}
          disabled={disabled}
          value={clause.op}
          onChange={(event) => onChange({ ...clause, op: event.target.value as PropertyClause['op'] })}
        >
          {OPERATORS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
        <input
          className={cn(fieldClass)}
          disabled={disabled}
          value={clause.value}
          placeholder="Value"
          onChange={(event) => onChange({ ...clause, value: event.target.value })}
        />
      </div>
    </div>
  )
}

function flattenStoreys(store: IfcDataStore): Array<{ id: number; name: string }> {
  const rows: Array<{ id: number; name: string }> = []
  const walk = (node: NonNullable<IfcDataStore['spatialHierarchy']>['project']) => {
    if (node.type === IfcTypeEnum.IfcBuildingStorey) {
      rows.push({
        id: node.expressId,
        name: node.name || store.entities.getName(node.expressId) || `Storey #${node.expressId}`,
      })
    }
    for (const child of node.children) walk(child)
  }
  const project = store.spatialHierarchy?.project
  if (project) walk(project)
  return rows
}
