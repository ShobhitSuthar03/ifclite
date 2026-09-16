import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Check, ChevronDown, Pencil, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { EntityData } from '@/lib/ifc-data'
import { AREA_FIELDS, STANDARD_FIELDS, type AreaMetrics } from '@/lib/geometry-qto'
import { commonProperties, selectionTypeLabel, type CommonPropertyRow } from '@/lib/common-properties'
import { formatCount } from '@/lib/utils'

type PropertiesPanelProps = {
  data: EntityData | null
  entities: EntityData[]
  parsing: boolean
  meshCount: number
  vertices: number
  triangles: number
  computedMetrics: AreaMetrics | null
  selectionCount?: number
  mutationCount?: number
  embedded?: boolean
  onClose: () => void
  onEditAttribute?: (name: string, value: string) => void
  onEditProperty?: (pset: string, name: string, value: string) => void
}

export function PropertiesPanel({
  data,
  entities,
  parsing,
  meshCount,
  vertices,
  triangles,
  computedMetrics,
  mutationCount = 0,
  embedded = false,
  onClose,
  onEditAttribute,
  onEditProperty,
}: PropertiesPanelProps) {
  const multi = entities.length > 1
  const primary = data ?? entities[0] ?? null
  const common = useMemo(() => (multi ? commonProperties(entities) : []), [entities, multi])
  const canMutate = Boolean(onEditAttribute || onEditProperty)
  const [editMode, setEditMode] = useState(false)
  const selectionKey = entities.map((item) => item.expressId).join(',')
  useEffect(() => {
    setEditMode(false)
  }, [selectionKey])

  const inner = !primary ? (
    <p className="px-3 py-6 text-xs text-muted-foreground">
      {parsing
        ? 'Property sets will appear here once the IFC index is ready. Click an element to inspect it.'
        : 'Click a wall, slab, or tree row to see GlobalId, attributes, property sets, and quantities.'}
    </p>
  ) : (
    <>
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
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-3 px-3 pb-3">
          {multi ? (
            groupRows(common).map(([group, rows]) => (
              <PsetGroup key={group} name={group} defaultOpen>
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
            <PsetGroup name="Attributes" defaultOpen>
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
          <PsetGroup name="Geometry" defaultOpen>
            <Row label="Meshes" value={formatCount(meshCount)} />
            <Row label="Vertices" value={formatCount(vertices)} />
            <Row label="Triangles" value={formatCount(triangles)} />
          </PsetGroup>
          {computedMetrics ? (
            <>
              <PsetGroup name="Standard quantities (geometry)" defaultOpen>
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
              <PsetGroup name="Computed areas (geometry)" defaultOpen>
                {AREA_FIELDS.map((field) => (
                  <Row
                    key={field.key}
                    label={field.label}
                    value={`${computedMetrics[field.key].toFixed(3)} m²`}
                  />
                ))}
              </PsetGroup>
            </>
          ) : null}
          {!multi && primary.propertySets.length === 0 ? (
            <p className="text-[11px] text-muted-foreground italic">No property sets</p>
          ) : null}
          {!multi &&
            primary.propertySets.map((set) => (
              <PsetGroup key={set.name} name={set.name} defaultOpen>
                {set.properties.map((property) => (
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
          {!multi && primary.quantitySets.length === 0 ? (
            <p className="text-[11px] text-muted-foreground italic">No quantity sets</p>
          ) : null}
          {!multi &&
            primary.quantitySets.map((set) => (
              <PsetGroup key={set.name} name={set.name} defaultOpen>
                {set.quantities.map((quantity) => (
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
  defaultOpen = false,
  children,
}: {
  name: string
  defaultOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  const id = useMemo(() => name, [name])
  return (
    <div className="overflow-hidden rounded border border-border">
      <button
        type="button"
        className="flex w-full items-center justify-between bg-muted px-3 py-2 text-left text-[12px] font-semibold"
        onClick={() => setOpen((value) => !value)}
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
