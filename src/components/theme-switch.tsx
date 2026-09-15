import { Moon, Sun } from 'lucide-react'
import { useTheme } from '@/components/theme-provider'
import { cn } from '@/lib/utils'
import type { Theme } from '@/lib/theme'

const OPTIONS: Array<{ id: Theme; label: string; icon: typeof Moon }> = [
  { id: 'dark', label: 'Dark', icon: Moon },
  { id: 'light', label: 'Light', icon: Sun },
]

export function ThemeSwitch() {
  const { theme, setTheme } = useTheme()

  return (
    <div
      role="radiogroup"
      aria-label="Color theme"
      className="inline-flex h-8 items-center rounded-md border border-border bg-background p-0.5"
    >
      {OPTIONS.map((option) => {
        const Icon = option.icon
        const selected = theme === option.id
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={selected}
            title={`${option.label} theme`}
            className={cn(
              'inline-flex h-7 items-center gap-1 rounded px-2 text-[11px] font-medium',
              selected
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
            onClick={() => setTheme(option.id)}
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{option.label}</span>
          </button>
        )
      })}
    </div>
  )
}
