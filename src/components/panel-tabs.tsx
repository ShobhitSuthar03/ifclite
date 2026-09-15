import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function PanelTabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: Array<{ id: T; label: string; icon?: ReactNode }>
  value: T
  onChange: (id: T) => void
}) {
  return (
    <div className="flex shrink-0 bg-muted">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={cn(
            'flex flex-1 items-center justify-center gap-1.5 border-b-2 px-2 py-2.5 text-[12px]',
            value === tab.id
              ? 'border-primary bg-card text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
          onClick={() => onChange(tab.id)}
        >
          {tab.icon}
          {tab.label}
        </button>
      ))}
    </div>
  )
}
