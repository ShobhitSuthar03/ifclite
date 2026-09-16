import { useEffect, useMemo, useState } from 'react'
import { ChevronRight, Search } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  findSpatialPath,
  spatialNodeMeta,
  type IfcDataStore,
  type SpatialTreeNode,
} from '@/lib/ifc-data'
import { collectNodeElementIds } from '@/lib/spatial-scope'
import { isAdditiveModifier } from '@/lib/selection'
import { cn, formatCount } from '@/lib/utils'

type SpatialTreeProps = {
  root: SpatialTreeNode | null
  store: IfcDataStore | null
  selectedId: number | null
  selectedIds: Set<number>
  isolatedIds: Set<number> | null
  parsing: boolean
  embedded?: boolean
  onSelect: (expressId: number, additive?: boolean) => void
  onSelectScope?: (ids: number[], additive?: boolean) => void
}

export function SpatialTree({
  root,
  store,
  selectedId,
  selectedIds,
  isolatedIds,
  parsing,
  embedded = false,
  onSelect,
  onSelectScope,
}: SpatialTreeProps) {
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!root) {
      setExpanded(new Set())
      return
    }
    const next = new Set<string>()
    collectAutoExpand(root, 0, next)
    setExpanded(next)
  }, [root])

  useEffect(() => {
    if (!root || selectedId == null) return
    const path = findSpatialPath(root, selectedId)
    if (!path) return
    setExpanded((current) => {
      const next = new Set(current)
      for (const id of path) next.add(`n:${id}`)
      return next
    })
    requestAnimationFrame(() => {
      document.getElementById(`tree-${selectedId}`)?.scrollIntoView({ block: 'nearest' })
    })
  }, [root, selectedId])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle || !root || !store) return root
    return filterNode(root, store, needle)
  }, [query, root, store])

  return (
    <aside className={cn('flex h-full min-h-0 w-full flex-col bg-card', !embedded && 'border-border lg:w-64 lg:border-r')}>
      {!embedded && (
        <div className="flex h-9 items-center justify-between gap-2 border-b border-border px-3">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Structure
          </span>
          {root ? (
            <span className="rounded bg-primary px-1.5 py-px text-[10px] font-semibold text-white">
              {formatCount(root.totalElements)}
            </span>
          ) : null}
        </div>
      )}
      <div className="border-b border-border p-2">
        <label className="relative block">
          <Search className="pointer-events-none absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search elements…"
            className="h-8 w-full rounded-md border border-border bg-background pr-2 pl-7 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="py-1">
          {!root && parsing ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground italic">Indexing spatial structure…</p>
          ) : !root ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground italic">
              Open an IFC file to explore Project → Site → Building → Storey.
            </p>
          ) : !filtered ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground italic">No matching elements.</p>
          ) : (
            <TreeNode
              node={filtered}
              depth={0}
              store={store}
              expanded={query.trim() ? 'all' : expanded}
              selectedIds={selectedIds}
              isolatedIds={isolatedIds}
              onToggle={(key) => {
                setExpanded((current) => {
                  const next = new Set(current)
                  if (next.has(key)) next.delete(key)
                  else next.add(key)
                  return next
                })
              }}
              onSelect={onSelect}
              onSelectScope={onSelectScope}
            />
          )}
        </div>
      </ScrollArea>
    </aside>
  )
}

function TreeNode({
  node,
  depth,
  store,
  expanded,
  selectedIds,
  isolatedIds,
  onToggle,
  onSelect,
  onSelectScope,
}: {
  node: SpatialTreeNode
  depth: number
  store: IfcDataStore | null
  expanded: Set<string> | 'all'
  selectedIds: Set<number>
  isolatedIds: Set<number> | null
  onToggle: (key: string) => void
  onSelect: (id: number, additive?: boolean) => void
  onSelectScope?: (ids: number[], additive?: boolean) => void
}) {
  const key = `n:${node.expressId}`
  const open = expanded === 'all' || expanded.has(key)
  const hasChildren = node.children.length > 0 || node.elementGroups.length > 0
  const meta = spatialNodeMeta(node.type)
  const name = node.name || store?.entities.getName(node.expressId) || `#${node.expressId}`

  return (
    <div>
      <button
        type="button"
        id={`tree-${node.expressId}`}
        style={{ paddingLeft: 8 + depth * 14 }}
        className={cn(
          'flex w-full items-center gap-1.5 rounded-[3px] py-[3px] pr-2 text-left text-[13px] hover:bg-accent',
          selectedIds.has(node.expressId) && 'bg-primary/20 text-foreground',
        )}
        onClick={(event) => {
          if (hasChildren) onToggle(key)
          const descendantIds = collectNodeElementIds(node)
          if (descendantIds.length > 0 && onSelectScope) {
            onSelectScope(descendantIds, isAdditiveModifier(event))
          } else {
            onSelect(node.expressId, isAdditiveModifier(event))
          }
        }}
      >
        <ChevronRight
          className={cn(
            'h-3 w-3 shrink-0 text-muted-foreground transition-transform',
            open && hasChildren && 'rotate-90',
            !hasChildren && 'opacity-0',
          )}
        />
        <span className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded text-[9px] font-bold', meta.tone)}>
          {meta.abbr}
        </span>
        <span className="min-w-0 flex-1 truncate">{name}</span>
        {node.elevation != null && (
          <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{node.elevation.toFixed(1)}m</span>
        )}
        {node.totalElements > 0 && (
          <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{formatCount(node.totalElements)}</span>
        )}
      </button>
      {open && hasChildren && (
        <div>
          {node.children.map((child) => (
            <TreeNode
              key={child.expressId}
              node={child}
              depth={depth + 1}
              store={store}
              expanded={expanded}
              selectedIds={selectedIds}
              isolatedIds={isolatedIds}
              onToggle={onToggle}
              onSelect={onSelect}
              onSelectScope={onSelectScope}
            />
          ))}
          {node.elementGroups.map((group) => (
            <TypeGroup
              key={`${node.expressId}-${group.typeName}`}
              parentId={node.expressId}
              group={group}
              depth={depth + 1}
              store={store}
              expanded={expanded}
              selectedIds={selectedIds}
              isolatedIds={isolatedIds}
              onToggle={onToggle}
              onSelect={onSelect}
              onSelectScope={onSelectScope}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function TypeGroup({
  parentId,
  group,
  depth,
  store,
  expanded,
  selectedIds,
  isolatedIds,
  onToggle,
  onSelect,
  onSelectScope,
}: {
  parentId: number
  group: { typeName: string; ids: number[] }
  depth: number
  store: IfcDataStore | null
  expanded: Set<string> | 'all'
  selectedIds: Set<number>
  isolatedIds: Set<number> | null
  onToggle: (key: string) => void
  onSelect: (id: number, additive?: boolean) => void
  onSelectScope?: (ids: number[], additive?: boolean) => void
}) {
  const groupKey = `g:${parentId}:${group.typeName}`
  const open = expanded === 'all' || expanded.has(groupKey)
  const visibleIds = open ? group.ids.slice(0, 250) : []

  return (
    <div>
      <button
        type="button"
        style={{ paddingLeft: 8 + depth * 14 }}
        className="flex w-full items-center gap-1.5 rounded-[3px] py-[3px] pr-2 text-left text-[13px] text-muted-foreground hover:bg-accent"
        onClick={(event) => {
          if (expanded !== 'all' && !expanded.has(groupKey)) onToggle(groupKey)
          if (onSelectScope) onSelectScope(group.ids, isAdditiveModifier(event))
          else onToggle(groupKey)
        }}
      >
        <ChevronRight className={cn('h-3 w-3 shrink-0 transition-transform', open && 'rotate-90')} />
        <span className="min-w-0 flex-1 truncate">{group.typeName}</span>
        <span className="font-mono text-[10px]">{formatCount(group.ids.length)}</span>
      </button>
      {open &&
        visibleIds.map((id) => {
          const label = store?.entities.getName(id) || `#${id}`
          return (
            <button
              key={id}
              type="button"
              id={`tree-${id}`}
              style={{ paddingLeft: 8 + (depth + 1) * 14 }}
              className={cn(
                'flex w-full items-center gap-1.5 rounded-[3px] py-[3px] pr-2 text-left text-[13px] hover:bg-accent',
                selectedIds.has(id) && 'bg-primary/20 text-foreground',
                isolatedIds != null && !isolatedIds.has(id) && 'opacity-35',
              )}
              onClick={(event) => onSelect(id, isAdditiveModifier(event))}
            >
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary/70" />
              <span className="min-w-0 flex-1 truncate">{label}</span>
              <span className="font-mono text-[10px] text-muted-foreground">#{id}</span>
            </button>
          )
        })}
      {open && group.ids.length > 250 ? (
        <p
          style={{ paddingLeft: 8 + (depth + 1) * 14 }}
          className="py-1 pr-2 text-[11px] text-muted-foreground"
        >
          Showing {formatCount(250)} of {formatCount(group.ids.length)}. Click the type to isolate all.
        </p>
      ) : null}
    </div>
  )
}

function collectAutoExpand(node: SpatialTreeNode, depth: number, into: Set<string>) {
  if (depth < 2) into.add(`n:${node.expressId}`)
  for (const child of node.children) collectAutoExpand(child, depth + 1, into)
}

function filterNode(node: SpatialTreeNode, store: IfcDataStore, needle: string): SpatialTreeNode | null {
  const selfMatch = matches(node.name, needle) || matches(node.longName, needle) || String(node.expressId).includes(needle)
  const children = node.children
    .map((child) => filterNode(child, store, needle))
    .filter((child): child is SpatialTreeNode => child != null)
  const elementGroups = node.elementGroups
    .map((group) => ({
      typeName: group.typeName,
      ids: group.ids.filter((id) => {
        const name = store.entities.getName(id)
        return matches(name, needle) || matches(group.typeName, needle) || String(id).includes(needle)
      }),
    }))
    .filter((group) => group.ids.length > 0)

  if (!selfMatch && children.length === 0 && elementGroups.length === 0) return null
  return { ...node, children, elementGroups }
}

function matches(value: string | undefined, needle: string): boolean {
  return (value ?? '').toLowerCase().includes(needle)
}
