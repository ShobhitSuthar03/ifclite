import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Search } from 'lucide-react'
import type { PropertyTreeNode } from '@/lib/property-tree'
import { cn, formatCount } from '@/lib/utils'

type PropertyValueTreeProps = {
  nodes: PropertyTreeNode[]
  selectedKeys: string[]
  levels?: string[]
  emptyText?: string
  onSelect: (node: PropertyTreeNode, event: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }) => void
}

export function PropertyValueTree({
  nodes,
  selectedKeys,
  levels,
  emptyText = 'No values in this scope.',
  onSelect,
}: PropertyValueTreeProps) {
  const [query, setQuery] = useState('')
  const selectedKeyList = selectedKeys.join('\0')
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(selectedKeys.flatMap((key) => ancestorKeys(key))))
  const grouping = (levels ?? []).join('\0')
  const visible = useMemo(() => filterPropertyTree(nodes, query), [nodes, query])
  const selectedSet = useMemo(() => new Set(selectedKeys), [selectedKeyList])

  useEffect(() => {
    setQuery('')
    setExpanded(new Set())
  }, [grouping])

  useEffect(() => {
    if (selectedKeys.length === 0) return
    setExpanded((current) => {
      const next = new Set(current)
      for (const key of selectedKeys) {
        for (const ancestor of ancestorKeys(key)) next.add(ancestor)
      }
      return next
    })
  }, [selectedKeyList])

  useEffect(() => {
    if (!query.trim()) return
    setExpanded(collectExpandableKeys(visible))
  }, [query, visible])

  const toggle = (key: string) => {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-muted/20">
      <div className="flex h-8 shrink-0 items-center justify-between gap-2 border-b border-border px-3">
        <span className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">Values</span>
        {levels && levels.length > 0 ? (
          <span className="min-w-0 truncate text-[11px] text-muted-foreground" title={levels.join(' › ')}>
            {levels.join(' › ')}
          </span>
        ) : null}
      </div>
      {nodes.length > 0 ? (
        <label className="relative shrink-0 border-b border-border">
          <Search className="pointer-events-none absolute top-2 left-2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            className="h-8 w-full bg-transparent pr-2 pl-7 text-xs text-foreground outline-none placeholder:text-muted-foreground"
            value={query}
            placeholder="Search values"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      ) : null}
      <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-1 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
        <span>Value</span>
        <span>Count</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {visible.length === 0 ? (
          <p className="px-3 py-6 text-xs text-muted-foreground italic">{query.trim() ? 'No values match.' : emptyText}</p>
        ) : (
          visible.map((node) => (
            <TreeRow
              key={node.key}
              node={node}
              selectedKeys={selectedSet}
              expanded={expanded}
              depth={0}
              levels={levels}
              onToggle={toggle}
              onSelect={onSelect}
            />
          ))
        )}
      </div>
    </div>
  )
}

function TreeRow({
  node,
  selectedKeys,
  expanded,
  depth,
  levels,
  onToggle,
  onSelect,
}: {
  node: PropertyTreeNode
  selectedKeys: Set<string>
  expanded: Set<string>
  depth: number
  levels?: string[]
  onToggle: (key: string) => void
  onSelect: (node: PropertyTreeNode, event: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }) => void
}) {
  const hasChildren = node.children.length > 0
  const selected = selectedKeys.has(node.key)
  const open = hasChildren && expanded.has(node.key)
  const levelName = levels?.[depth]

  return (
    <div>
      <div
        className={cn(
          'group flex w-full items-stretch hover:bg-accent',
          selected && 'bg-primary/20 hover:bg-primary/20',
          !selected && depth === 1 && 'bg-background/40',
          !selected && depth >= 2 && 'bg-background/70',
        )}
      >
        {hasChildren ? (
          <button
            type="button"
            className="flex w-6 shrink-0 items-center justify-center text-muted-foreground"
            style={{ marginLeft: depth * 12 }}
            aria-label={open ? `Collapse ${node.label}` : `Expand ${node.label}`}
            onClick={(event) => {
              event.stopPropagation()
              onToggle(node.key)
            }}
          >
            {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
        ) : (
          <span className="flex w-6 shrink-0 items-center justify-center" style={{ marginLeft: depth * 12 }}>
            <span className="h-3.5 w-px bg-border" />
          </span>
        )}
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 py-1 pr-3 text-left"
          onClick={(event) => onSelect(node, event)}
        >
          {node.color ? (
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: node.color }} />
          ) : depth > 0 ? (
            <span className="h-4 w-px shrink-0 bg-border" />
          ) : null}
          <span className="min-w-0 flex-1">
            <span className={cn('block truncate text-[13px]', hasChildren ? 'font-medium' : 'font-normal')}>
              {node.label}
            </span>
            {levelName ? (
              <span className="block truncate text-[10px] text-muted-foreground">{levelName}</span>
            ) : null}
          </span>
          <span className="shrink-0 rounded bg-muted px-1.5 py-px font-mono text-[11px] text-muted-foreground tabular-nums">
            {formatCount(node.count)}
          </span>
        </button>
      </div>
      {open
        ? node.children.map((child) => (
            <TreeRow
              key={child.key}
              node={child}
              selectedKeys={selectedKeys}
              expanded={expanded}
              depth={depth + 1}
              levels={levels}
              onToggle={onToggle}
              onSelect={onSelect}
            />
          ))
        : null}
    </div>
  )
}

function ancestorKeys(key: string | null): string[] {
  if (!key) return []
  const parts = key.split('/')
  const keys: string[] = []
  for (let i = 1; i < parts.length; i += 1) keys.push(parts.slice(0, i).join('/'))
  return keys
}

function filterPropertyTree(nodes: PropertyTreeNode[], query: string): PropertyTreeNode[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return nodes
  const walk = (list: PropertyTreeNode[]): PropertyTreeNode[] => {
    const rows: PropertyTreeNode[] = []
    for (const node of list) {
      const children = walk(node.children)
      if (node.label.toLowerCase().includes(needle) || children.length > 0) {
        rows.push({ ...node, children })
      }
    }
    return rows
  }
  return walk(nodes)
}

function collectExpandableKeys(nodes: PropertyTreeNode[]): Set<string> {
  const keys = new Set<string>()
  const walk = (list: PropertyTreeNode[]) => {
    for (const node of list) {
      if (node.children.length > 0) {
        keys.add(node.key)
        walk(node.children)
      }
    }
  }
  walk(nodes)
  return keys
}
