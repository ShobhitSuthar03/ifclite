import { ChevronDown, ChevronUp, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { groupingCatalog, type PropertyCatalogSet } from '@/lib/bim-sql'
import {
  ATTRIBUTE_IFC_TYPE,
  moveFilterRule,
  propertyRefKey,
  propertyRefLabel,
  removeFilterRule,
  type PropertyRef,
} from '@/lib/property-tree'
import { cn } from '@/lib/utils'

const fieldClass =
  'h-7 w-full min-w-0 rounded border border-border bg-background px-1.5 text-xs text-foreground outline-none focus-visible:border-primary disabled:opacity-50'

type BreakdownRuleListProps = {
  rules: PropertyRef[]
  disabled?: boolean
  catalog?: PropertyCatalogSet[]
  onChange: (rules: PropertyRef[]) => void
}

export function BreakdownRuleList({ rules, disabled, catalog, onChange }: BreakdownRuleListProps) {
  if (rules.length === 0) return null
  const groups = catalog ? groupingCatalog(catalog) : []

  return (
    <div className="overflow-hidden rounded border border-border">
      {rules.map((rule, index) => {
        const canUp = index > 0
        const canDown = index < rules.length - 1
        return (
          <div
            key={`${propertyRefKey(rule)}-${index}`}
            className={cn('flex items-center gap-1 bg-background px-1.5 py-1', index > 0 && 'border-t border-border')}
          >
            <span className="w-10 shrink-0 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
              {index === 0 ? 'Group' : 'Then'}
            </span>
            {catalog ? (
              <select
                className={cn(fieldClass, 'flex-1')}
                disabled={disabled}
                value={propertyRefKey(rule)}
                onChange={(event) => {
                  const next = refFromCatalog(groups, event.target.value) ?? ATTRIBUTE_IFC_TYPE
                  onChange(rules.map((item, itemIndex) => (itemIndex === index ? next : item)))
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
            ) : (
              <span className="min-w-0 flex-1 truncate text-[12px]" title={propertyRefLabel(rule)}>
                {rule.name}
              </span>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              disabled={disabled || !canUp}
              aria-label={`Move ${rule.name} up`}
              onClick={() => onChange(moveFilterRule(rules, index, index - 1))}
            >
              <ChevronUp />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              disabled={disabled || !canDown}
              aria-label={`Move ${rule.name} down`}
              onClick={() => onChange(moveFilterRule(rules, index, index + 1))}
            >
              <ChevronDown />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              disabled={disabled || (catalog != null && index === 0 && rules.length === 1)}
              aria-label={`Remove ${propertyRefLabel(rule)}`}
              onClick={() => onChange(removeFilterRule(rules, rule))}
            >
              <X />
            </Button>
          </div>
        )
      })}
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
