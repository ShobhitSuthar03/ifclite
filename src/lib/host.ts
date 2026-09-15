import { isTauri as tauriCoreIsTauri } from '@tauri-apps/api/core'
import { isTauri as geometryIsTauri } from '@ifc-lite/geometry'

export { geometryIsTauri as isTauri }

export type HostKind = 'tauri' | 'web'

/** True when the page is the native WebView, not a normal browser tab. */
export function isDesktopShell(): boolean {
  try {
    if (tauriCoreIsTauri()) return true
  } catch {
    // jsdom / SSR
  }
  try {
    if (geometryIsTauri()) return true
  } catch {
    // geometry helper can throw if window is incomplete
  }
  if (typeof window === 'undefined') return false
  const webview = window as Window & { isTauri?: boolean; __TAURI_INTERNALS__?: unknown }
  return Boolean(webview.isTauri || webview.__TAURI_INTERNALS__)
}

export function hostKind(): HostKind {
  return isDesktopShell() ? 'tauri' : 'web'
}

export function hostLabel(kind: HostKind = hostKind()): string {
  return kind === 'tauri' ? 'Desktop' : 'Browser'
}

export function hostDetail(kind: HostKind = hostKind()): string {
  if (kind === 'tauri') {
    return 'GeometryProcessor routes through NativeBridge → ifc-lite-processing (Rayon).'
  }
  return 'No Tauri host detected. Geometry uses the WASM worker path until you run npm run dev:desktop.'
}
