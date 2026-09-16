import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { PropertyValueTree } from '@/components/property-value-tree'
import { groupingCatalog, type PropertyCatalogSet } from '@/lib/bim-sql'
import {
  ATTRIBUTE_IFC_TYPE,
  propertyRefKey,
  propertyRefLabel,
  samePropertyRef,
  type PropertyRef,
  type PropertyTreeNode,
} from '@/lib/property-tree'
import { cn } from '@/lib/utils'

const fieldClass =
  'h-8 w-full rounded border border-border bg-background px-2 text-xs text-foreground outline-none focus-visible:border-primary disabled:opacity-50'

const MAX_RULES = 3

type BreakdownPanelProps = {
  ready: boolean
  hint?: string | null
  catalog: PropertyCatalogSet[]
  rules: PropertyRef[]
  tree: PropertyTreeNode[]
  selectedKey: string | null
  colorize: boolean
  onRulesChange: (rules: PropertyRef[]) => void
  onSelectNode: (node: PropertyTreeNode | null) => void
  onColorizeChange: (colorize: boolean) => void
}

export function BreakdownPanel({
  ready,
  hint,
  catalog,
  rules,
  tree,
  selectedKey,
  colorize,
  onRulesChange,
  onSelectNode,
  onColorizeChange,
}: BreakdownPanelProps) {
  const groups = groupingCatalog(catalog)
  const disabled = !ready

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-2 border-b border-border p-3">
        <p className="text-[11px] text-muted-foreground">
          Custom breakdown: group by a property, then add another property to nest unique values.
        </p>
        {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
        {rules.map((rule, index) => (
          <div key={`${propertyRefKey(rule)}-${index}`} className="flex items-center gap-1.5">
            <span className="w-10 shrink-0 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
              {index === 0 ? 'Group' : `Then`}
            </span>
            <select
              className={fieldClass}
              disabled={disabled}
              value={propertyRefKey(rule)}
              onChange={(event) => {
                const next = refFromCatalog(groups, event.target.value) ?? ATTRIBUTE_IFC_TYPE
                onRulesChange(rules.map((item, itemIndex) => (itemIndex === index ? next : item)))
              }}
            >
              {groups.map((group) => (
                <optgroup key={`${group.kind}:${group.set}`} label={group.set}>
                  {group.names.map((name) => {
                    const ref: PropertyRef = { set: group.set, name, kind: group.kind }
                    return (
                      <option key={propertyRefKey(ref)} value={propertyRefKey(ref)}>
                        {propertyRefLabel(ref)}
                      </option>
                    )
                  })}
                </optgroup>
              ))}
            </select>
            {index > 0 ? (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                disabled={disabled}
                onClick={() => onRulesChange(rules.filter((_, itemIndex) => itemIndex !== index))}
              >
                <X />
              </Button>
            ) : null}
          </div>
        ))}
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            disabled={disabled || rules.length >= MAX_RULES}
            onClick={() => {
              const next = firstUnused(groups, rules)
              if (next) onRulesChange([...rules, next])
            }}
          >
            <Plus />
            Property
          </Button>
          <label className={cn('flex items-center gap-1.5 text-[11px]', disabled && 'opacity-50')}>
            <input
              type="checkbox"
              disabled={disabled}
              checked={colorize}
              onChange={(event) => onColorizeChange(event.target.checked)}
            />
            Color 3D
          </label>
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        {!ready ? (
          <p className="px-3 py-6 text-xs text-muted-foreground">Load a model to build a breakdown.</p>
        ) : tree.length === 0 ? (
          <p className="px-3 py-6 text-xs text-muted-foreground italic">No values for this grouping.</p>
        ) : (
          <PropertyValueTree
            nodes={tree}
            selectedKey={selectedKey}
            onSelect={(node) => onSelectNode(selectedKey === node.key ? null : node)}
          />
        )}
      </ScrollArea>
    </div>
  )
}

function refFromCatalog(groups: PropertyCatalogSet[], key: string): PropertyRef | null {
  for (const group of groups) {
    for (const name of group.names) {
      const ref: PropertyRef = { set: group.set, name, kind: group.kind }
      if (propertyRefKey(ref) === key) return ref
    }
  }
  return null
}

function firstUnused(groups: PropertyCatalogSet[], rules: PropertyRef[]): PropertyRef | null {
  for (const group of groups) {
    for (const name of group.names) {
      const ref: PropertyRef = { set: group.set, name, kind: group.kind }
      if (!rules.some((rule) => samePropertyRef(rule, ref))) return ref
    }
  }
  return null
}
