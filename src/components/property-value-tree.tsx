import { ChevronDown, ChevronRight } from 'lucide-react'
import type { PropertyTreeNode } from '@/lib/property-tree'
import { cn, formatCount } from '@/lib/utils'

type PropertyValueTreeProps = {
  nodes: PropertyTreeNode[]
  selectedKey: string | null
  depth?: number
  onSelect: (node: PropertyTreeNode) => void
}

export function PropertyValueTree({ nodes, selectedKey, depth = 0, onSelect }: PropertyValueTreeProps) {
  return (
    <div>
      {nodes.map((node) => (
        <TreeRow key={node.key} node={node} selectedKey={selectedKey} depth={depth} onSelect={onSelect} />
      ))}
    </div>
  )
}

function TreeRow({
  node,
  selectedKey,
  depth,
  onSelect,
}: {
  node: PropertyTreeNode
  selectedKey: string | null
  depth: number
  onSelect: (node: PropertyTreeNode) => void
}) {
  const hasChildren = node.children.length > 0
  const selected = selectedKey === node.key
  const childSelected = Boolean(selectedKey?.startsWith(`${node.key}/`))
  const open = !hasChildren || selected || childSelected

  return (
    <div>
      <button
        type="button"
        className={cn(
          'flex w-full items-center gap-1.5 py-1 pr-3 text-left text-[13px] hover:bg-accent',
          selected && 'bg-primary/20 text-foreground',
        )}
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={() => onSelect(node)}
      >
        {hasChildren ? (
          open ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          )
        ) : (
          <span className="w-3.5 shrink-0" />
        )}
        {node.color ? (
          <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: node.color }} />
        ) : null}
        <span className="min-w-0 flex-1 truncate font-mono">{node.label}</span>
        <span className="font-mono text-[11px] text-muted-foreground">{formatCount(node.count)}</span>
      </button>
      {hasChildren && open ? (
        <PropertyValueTree nodes={node.children} selectedKey={selectedKey} depth={depth + 1} onSelect={onSelect} />
      ) : null}
    </div>
  )
}
