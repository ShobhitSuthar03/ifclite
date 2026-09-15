export type Theme = 'dark' | 'light'

export const THEME_STORAGE_KEY = 'ifclite.theme'

export const VIEWPORT_THEME = {
  dark: { clear: 0x18181c, gridMajor: 0x3f3f4e, gridMinor: 0x2b2b36 },
  light: { clear: 0xf7f7fa, gridMajor: 0xc5c7d0, gridMinor: 0xe4e6ec },
} as const

export function isTheme(value: string | null): value is Theme {
  return value === 'dark' || value === 'light'
}

export function readStoredTheme(): Theme {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY)
    if (isTheme(raw)) return raw
  } catch {
    /* private mode */
  }
  return 'dark'
}

export function persistTheme(theme: Theme) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    /* private mode */
  }
}

export function applyThemeClass(theme: Theme) {
  const root = document.documentElement
  root.classList.toggle('dark', theme === 'dark')
  root.dataset.theme = theme
  root.style.colorScheme = theme
}
