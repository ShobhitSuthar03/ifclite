import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Check, ChevronDown, ChevronsDownUp, ChevronsUpDown, Pencil, Plus, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { EntityData } from '@/lib/ifc-data'
import { AREA_FIELDS, PERIMETER_FIELDS, STANDARD_FIELDS, type AreaMetrics } from '@/lib/geometry-qto'
import { commonProperties, selectionTypeLabel, type CommonPropertyRow } from '@/lib/common-properties'
import { cn, formatCount } from '@/lib/utils'

export type PropertyScope = 'selected' | 'model'

const fieldClass =
  'h-7 w-full rounded border border-border bg-background px-2 text-[12px] outline-none focus-visible:ring-2 focus-visible:ring-ring'

type PropertiesPanelProps = {
  data: EntityData | null
  entities: EntityData[]
  parsing: boolean
  meshCount: number
  vertices: number
  triangles: number
  computedMetrics: AreaMetrics | null
  selectionCount?: number
  modelElementCount?: number
  mutationCount?: number
  embedded?: boolean
  onClose: () => void
  onEditAttribute?: (name: string, value: string) => void
  onEditProperty?: (pset: string, name: string, value: string) => void
  onAddProperty?: (pset: string, name: string, value: string, scope: PropertyScope) => void
}

export function PropertiesPanel({
  data,
  entities,
  parsing,
  meshCount,
  vertices,
  triangles,
  computedMetrics,
  modelElementCount = 0,
  mutationCount = 0,
  embedded = false,
  onClose,
  onEditAttribute,
  onEditProperty,
  onAddProperty,
}: PropertiesPanelProps) {
  const multi = entities.length > 1
  const primary = data ?? entities[0] ?? null
  const common = useMemo(() => (multi ? commonProperties(entities) : []), [entities, multi])
  const canMutate = Boolean(onEditAttribute || onEditProperty)
  const [editMode, setEditMode] = useState(false)
  const [propertySearch, setPropertySearch] = useState('')
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set())
  const selectionKey = entities.map((item) => item.expressId).join(',')
  useEffect(() => {
    setEditMode(false)
    setPropertySearch('')
    setCollapsedGroups(new Set())
  }, [selectionKey])

  const searchNeedle = propertySearch.trim().toLowerCase()
  const searching = searchNeedle.length > 0
  // Searching auto-expands every group so matches are visible without also
  // fighting the user's own collapse choices - those choices just resume
  // once the search is cleared.
  const isGroupOpen = (name: string) => searching || !collapsedGroups.has(name)
  const toggleGroup = (name: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const groupedCommon = useMemo(() => groupRows(common), [common])
  const filteredPropertySets = useMemo(() => {
    if (!primary) return []
    return filterSets(primary.propertySets, searchNeedle, (set) => set.properties, (property) => property.name)
  }, [primary, searchNeedle])
  const filteredQuantitySets = useMemo(() => {
    if (!primary) return []
    return filterSets(primary.quantitySets, searchNeedle, (set) => set.quantities, (quantity) => quantity.name)
  }, [primary, searchNeedle])
  const filteredCommonGroups = useMemo(() => {
    if (!searching) return groupedCommon
    return groupedCommon
      .map(([group, rows]): [string, CommonPropertyRow[]] => [
        group,
        group.toLowerCase().includes(searchNeedle) ? rows : rows.filter((row) => row.name.toLowerCase().includes(searchNeedle)),
      ])
      .filter(([, rows]) => rows.length > 0)
  }, [groupedCommon, searching, searchNeedle])

  const allGroupNames = useMemo(() => {
    const names: string[] = []
    if (!primary) return names
    if (multi) {
      for (const [group] of groupedCommon) names.push(group)
    } else {
      names.push('Attributes', ...primary.propertySets.map((set) => set.name), ...primary.quantitySets.map((set) => set.name))
    }
    names.push('Geometry')
    if (computedMetrics) {
      names.push('Standard quantities (geometry)', 'Computed areas (geometry)', 'Computed perimeters (geometry)')
    }
    return names
  }, [primary, multi, groupedCommon, computedMetrics])
  const allCollapsed = allGroupNames.length > 0 && allGroupNames.every((name) => collapsedGroups.has(name))

  const addPropertyForm = onAddProperty ? (
    <AddPropertyForm selectionCount={entities.length} modelElementCount={modelElementCount} onAdd={onAddProperty} />
  ) : null

  const inner = !primary ? (
    <>
      {addPropertyForm}
      <p className="px-3 py-6 text-xs text-muted-foreground">
        {parsing
          ? 'Property sets will appear here once the IFC index is ready. Click an element to inspect it.'
          : 'Click a wall, slab, or tree row to see GlobalId, attributes, property sets, and quantities.'}
      </p>
    </>
  ) : (
    <>
      {addPropertyForm}
      <div className="flex items-start gap-2 p-3">
        <div className="min-w-0 flex-1 rounded bg-black/20 p-2">
          <p className="text-[13px] font-bold text-primary">
            {multi ? selectionTypeLabel(entities) : primary.ifcType}
          </p>
          <p className="truncate text-[13px]">
            {multi ? `${formatCount(entities.length)} elements` : primary.name || `Entity #${primary.expressId}`}
          </p>
          <p className="font-mono text-[11px] text-muted-foreground">
            {multi
              ? editMode
                ? 'Editing all selected · same value is written to every element'
                : 'Common properties · numeric values are summed'
              : `GUID: ${primary.globalId || '—'}`}
          </p>
          {mutationCount > 0 ? (
            <p className="mt-1 text-[11px] text-primary">{formatCount(mutationCount)} unsaved property edits</p>
          ) : null}
        </div>
        {canMutate ? (
          <Button
            variant={editMode ? 'default' : 'outline'}
            size="sm"
            className="h-7 shrink-0 px-2 text-[11px]"
            onClick={() => setEditMode((value) => !value)}
            title={editMode ? 'Finish editing' : 'Edit properties'}
          >
            {editMode ? <Check className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
            {editMode ? 'Done' : 'Edit'}
          </Button>
        ) : null}
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose} title="Clear selection (Esc)">
          <X />
        </Button>
      </div>
      <div className="flex items-center gap-1.5 px-3 pb-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            className="h-7 w-full rounded border border-border bg-background pr-2 pl-7 text-[12px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="Search property or property set…"
            value={propertySearch}
            onChange={(event) => setPropertySearch(event.target.value)}
          />
        </div>
        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7 shrink-0"
          disabled={allGroupNames.length === 0}
          title={allCollapsed ? 'Expand all' : 'Collapse all'}
          onClick={() => setCollapsedGroups(allCollapsed ? new Set() : new Set(allGroupNames))}
        >
          {allCollapsed ? <ChevronsUpDown className="h-3.5 w-3.5" /> : <ChevronsDownUp className="h-3.5 w-3.5" />}
        </Button>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-3 px-3 pb-3">
          {multi ? (
            filteredCommonGroups.map(([group, rows]) => (
              <PsetGroup key={group} name={group} open={isGroupOpen(group)} onToggle={() => toggleGroup(group)}>
                {rows.map((row) => (
                  <PropertyValue
                    key={`${row.group}-${row.name}`}
                    row={row}
                    editMode={editMode}
                    onEditAttribute={onEditAttribute}
                    onEditProperty={onEditProperty}
                  />
                ))}
              </PsetGroup>
            ))
          ) : (
            <PsetGroup name="Attributes" open={isGroupOpen('Attributes')} onToggle={() => toggleGroup('Attributes')}>
              <Row label="GlobalId" value={primary.globalId} />
              <EditableRow
                key={`${primary.expressId}-Name-${mutationCount}-${editMode}`}
                label="Name"
                value={primary.name}
                editMode={editMode}
                onSave={(value) => onEditAttribute?.('Name', value)}
              />
              <EditableRow
                key={`${primary.expressId}-Description-${mutationCount}-${editMode}`}
                label="Description"
                value={primary.description}
                editMode={editMode}
                onSave={(value) => onEditAttribute?.('Description', value)}
              />
              <EditableRow
                key={`${primary.expressId}-ObjectType-${mutationCount}-${editMode}`}
                label="ObjectType"
                value={primary.objectType}
                editMode={editMode}
                onSave={(value) => onEditAttribute?.('ObjectType', value)}
              />
              <EditableRow
                key={`${primary.expressId}-Tag-${mutationCount}-${editMode}`}
                label="Tag"
                value={primary.tag}
                editMode={editMode}
                onSave={(value) => onEditAttribute?.('Tag', value)}
              />
            </PsetGroup>
          )}
          <PsetGroup name="Geometry" open={isGroupOpen('Geometry')} onToggle={() => toggleGroup('Geometry')}>
            <Row label="Meshes" value={formatCount(meshCount)} />
            <Row label="Vertices" value={formatCount(vertices)} />
            <Row label="Triangles" value={formatCount(triangles)} />
          </PsetGroup>
          {computedMetrics ? (
            <>
              <PsetGroup
                name="Standard quantities (geometry)"
                open={isGroupOpen('Standard quantities (geometry)')}
                onToggle={() => toggleGroup('Standard quantities (geometry)')}
              >
                {STANDARD_FIELDS.map((field) => (
                  <Row
                    key={field.key}
                    label={field.label}
                    value={
                      field.unit
                        ? `${computedMetrics[field.key].toFixed(3)} ${field.unit}`
                        : formatCount(computedMetrics[field.key])
                    }
                  />
                ))}
              </PsetGroup>
              <PsetGroup
                name="Computed areas (geometry)"
                open={isGroupOpen('Computed areas (geometry)')}
                onToggle={() => toggleGroup('Computed areas (geometry)')}
              >
                {AREA_FIELDS.map((field) => (
                  <Row
                    key={field.key}
                    label={field.label}
                    value={`${computedMetrics[field.key].toFixed(3)} m²`}
                  />
                ))}
              </PsetGroup>
              <PsetGroup
                name="Computed perimeters (geometry)"
                open={isGroupOpen('Computed perimeters (geometry)')}
                onToggle={() => toggleGroup('Computed perimeters (geometry)')}
              >
                {PERIMETER_FIELDS.map((field) => (
                  <Row
                    key={field.key}
                    label={field.label}
                    value={`${computedMetrics[field.key].toFixed(3)} m`}
                  />
                ))}
              </PsetGroup>
            </>
          ) : null}
          {!multi && filteredPropertySets.length === 0 ? (
            <p className="text-[11px] text-muted-foreground italic">
              {searching ? 'No matching properties' : 'No property sets'}
            </p>
          ) : null}
          {!multi &&
            filteredPropertySets.map(({ set, items }) => (
              <PsetGroup key={set.name} name={set.name} open={isGroupOpen(set.name)} onToggle={() => toggleGroup(set.name)}>
                {items.map((property) => (
                  <EditableRow
                    key={`${primary.expressId}-${set.name}-${property.name}-${mutationCount}-${editMode}`}
                    label={property.name}
                    value={property.value}
                    editMode={editMode}
                    onSave={(value) => onEditProperty?.(set.name, property.name, value)}
                  />
                ))}
              </PsetGroup>
            ))}
          {!multi && filteredQuantitySets.length === 0 ? (
            <p className="text-[11px] text-muted-foreground italic">
              {searching ? 'No matching quantities' : 'No quantity sets'}
            </p>
          ) : null}
          {!multi &&
            filteredQuantitySets.map(({ set, items }) => (
              <PsetGroup key={set.name} name={set.name} open={isGroupOpen(set.name)} onToggle={() => toggleGroup(set.name)}>
                {items.map((quantity) => (
                  <Row key={quantity.name} label={quantity.name} value={quantity.value} />
                ))}
              </PsetGroup>
            ))}
        </div>
      </ScrollArea>
    </>
  )

  if (embedded) {
    return <div className="flex h-full min-h-0 flex-col">{inner}</div>
  }

  return (
    <aside className="flex h-full min-h-0 w-full flex-col border-border bg-card lg:w-80 lg:border-l">{inner}</aside>
  )
}

function AddPropertyForm({
  selectionCount,
  modelElementCount,
  onAdd,
}: {
  selectionCount: number
  modelElementCount: number
  onAdd: (pset: string, name: string, value: string, scope: PropertyScope) => void
}) {
  const [open, setOpen] = useState(false)
  const [pset, setPset] = useState('VERBIM')
  const [name, setName] = useState('')
  const [value, setValue] = useState('')
  const [scope, setScope] = useState<PropertyScope>('selected')

  const scopeCount = scope === 'model' ? modelElementCount : selectionCount
  const canSubmit = pset.trim() !== '' && name.trim() !== '' && scopeCount > 0

  const submit = () => {
    if (!canSubmit) return
    onAdd(pset.trim(), name.trim(), value.trim(), scope)
    setName('')
    setValue('')
  }

  return (
    <div className="border-b border-border p-3">
      <button
        type="button"
        className="flex w-full items-center justify-between text-[12px] font-semibold"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
      >
        <span className="flex items-center gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          Add property
        </span>
        <ChevronDown className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform', !open && '-rotate-90')} />
      </button>
      {open ? (
        <form
          className="mt-2 space-y-2"
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          <div className="grid grid-cols-2 gap-1.5">
            <label className="block text-[11px]">
              <span className="mb-0.5 block text-muted-foreground">Property set</span>
              <input className={fieldClass} value={pset} onChange={(event) => setPset(event.target.value)} placeholder="VERBIM" />
            </label>
            <label className="block text-[11px]">
              <span className="mb-0.5 block text-muted-foreground">Property name</span>
              <input className={fieldClass} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Status" />
            </label>
          </div>
          <label className="block text-[11px]">
            <span className="mb-0.5 block text-muted-foreground">Value</span>
            <input className={fieldClass} value={value} onChange={(event) => setValue(event.target.value)} />
          </label>
          <div className="flex flex-wrap items-center gap-3 text-[11px]">
            <label className="flex items-center gap-1">
              <input
                type="radio"
                name="add-property-scope"
                checked={scope === 'selected'}
                onChange={() => setScope('selected')}
              />
              Selected ({formatCount(selectionCount)})
            </label>
            <label className="flex items-center gap-1">
              <input type="radio" name="add-property-scope" checked={scope === 'model'} onChange={() => setScope('model')} />
              Whole model ({formatCount(modelElementCount)})
            </label>
          </div>
          <Button type="submit" size="sm" className="w-full" disabled={!canSubmit}>
            Add property
          </Button>
          {scopeCount === 0 ? (
            <p className="text-[11px] text-muted-foreground italic">
              {scope === 'selected' ? 'Select elements first, or switch to “Whole model”.' : 'Open a model first.'}
            </p>
          ) : null}
        </form>
      ) : null}
    </div>
  )
}

/** A set (property or quantity set) matches if its own name matches, showing
 * all its items, or if only some of its items match by name. */
function filterSets<TSet extends { name: string }, TItem>(
  sets: TSet[],
  needle: string,
  itemsOf: (set: TSet) => TItem[],
  nameOf: (item: TItem) => string,
): Array<{ set: TSet; items: TItem[] }> {
  return sets
    .map((set) => {
      const items = itemsOf(set)
      if (!needle) return { set, items }
      const setMatches = set.name.toLowerCase().includes(needle)
      return { set, items: setMatches ? items : items.filter((item) => nameOf(item).toLowerCase().includes(needle)) }
    })
    .filter(({ items }) => !needle || items.length > 0)
}

function groupRows(rows: CommonPropertyRow[]) {
  const groups = new Map<string, CommonPropertyRow[]>()
  for (const row of rows) {
    const list = groups.get(row.group) ?? []
    list.push(row)
    groups.set(row.group, list)
  }
  return [...groups.entries()]
}

function PropertyValue({
  row,
  editMode,
  onEditAttribute,
  onEditProperty,
}: {
  row: CommonPropertyRow
  editMode: boolean
  onEditAttribute?: (name: string, value: string) => void
  onEditProperty?: (pset: string, name: string, value: string) => void
}) {
  const writable = editMode && !row.summed && row.kind !== 'quantity'
  const display = row.summed ? `${row.value} (sum)` : row.value
  if (!writable) return <Row label={row.name} value={display} />
  return (
    <EditableRow
      label={row.name}
      value={row.mixed ? '' : row.value}
      mixed={row.mixed}
      editMode
      onSave={(value) => {
        if (row.kind === 'attribute') onEditAttribute?.(row.name, value)
        else onEditProperty?.(row.group, row.name, value)
      }}
    />
  )
}

function PsetGroup({
  name,
  open,
  onToggle,
  children,
}: {
  name: string
  open: boolean
  onToggle: () => void
  children: ReactNode
}) {
  const id = useMemo(() => name, [name])
  return (
    <div className="overflow-hidden rounded border border-border">
      <button
        type="button"
        className="flex w-full items-center justify-between bg-muted px-3 py-2 text-left text-[12px] font-semibold"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={id}
      >
        <span className="truncate">{name}</span>
        <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${open ? '' : '-rotate-90'}`} />
      </button>
      {open && (
        <div id={id} className="px-3 py-1.5">
          {children}
        </div>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  const empty = !value || value === '—'
  return (
    <div className="flex justify-between gap-3 border-b border-dashed border-border py-1 text-[12px] last:border-b-0">
      <dt className="max-w-[50%] shrink-0 text-muted-foreground">{label}</dt>
      <dd className={`min-w-0 break-all text-right font-medium ${empty ? 'text-muted-foreground italic' : ''}`}>
        {empty ? '—' : value}
      </dd>
    </div>
  )
}

function EditableRow({
  label,
  value,
  mixed = false,
  editMode = false,
  onSave,
}: {
  label: string
  value: string
  mixed?: boolean
  editMode?: boolean
  onSave?: (value: string) => void
}) {
  const [draft, setDraft] = useState(value)
  const [editing, setEditing] = useState(false)
  useEffect(() => {
    setEditing(false)
    setDraft(value)
  }, [value, editMode])
  if (!onSave || !editMode) return <Row label={label} value={mixed ? 'mixed' : value} />
  if (!editing) {
    return (
      <button
        type="button"
        className="flex w-full justify-between gap-3 border-b border-dashed border-border py-1 text-left text-[12px] last:border-b-0 hover:bg-accent/40"
        onClick={() => {
          setDraft(mixed || value === '—' ? '' : value)
          setEditing(true)
        }}
      >
        <span className="max-w-[50%] shrink-0 text-muted-foreground">{label}</span>
        <span
          className={`min-w-0 break-all text-right font-medium ${mixed || !value || value === '—' ? 'text-muted-foreground italic' : ''}`}
        >
          {mixed ? 'mixed' : !value || value === '—' ? '—' : value}
        </span>
      </button>
    )
  }
  const commit = () => {
    const next = draft.trim()
    setEditing(false)
    if (mixed && next === '') return
    if (next === 'mixed') return
    onSave(next)
  }
  return (
    <form
      className="flex items-center gap-2 border-b border-dashed border-border py-1 last:border-b-0"
      onSubmit={(event) => {
        event.preventDefault()
        commit()
      }}
    >
      <span className="max-w-[40%] shrink-0 text-[12px] text-muted-foreground">{label}</span>
      <input
        autoFocus
        className="h-6 min-w-0 flex-1 rounded border border-border bg-background px-1 text-[12px]"
        value={draft}
        placeholder={mixed ? 'Type a value for all selected' : undefined}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
      />
    </form>
  )
}
