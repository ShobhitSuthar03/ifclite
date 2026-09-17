/**
 * Cross-window sync for "detached" panels: a panel can be popped out of the main window into
 * its own Tauri webview window (e.g. to put it on a second monitor) while staying live. The
 * main window keeps doing all the real computation (it owns the geometry/warehouse/quantities)
 * and just broadcasts the already-computed, JSON-serializable props for that panel; the pane
 * window renders the exact same component, wired to those synced props, and forwards user
 * actions back as fire-and-forget events that the main window applies through its normal
 * handlers (which naturally re-broadcasts the result on the next render).
 */

export type PaneId = 'boq' | 'buildup' | 'chat'

const STATE_EVENT = (pane: PaneId) => `ifclite:pane-state:${pane}`
const ACTION_EVENT = (pane: PaneId) => `ifclite:pane-action:${pane}`
const CLOSED_EVENT = (pane: PaneId) => `ifclite:pane-closed:${pane}`

export function paneWindowLabel(pane: PaneId): string {
  return `pane-${pane}`
}

/** Main window: push the latest state for a pane out to its detached window, if any. */
export async function broadcastPaneState(pane: PaneId, state: unknown): Promise<void> {
  const { emit } = await import('@tauri-apps/api/event')
  await emit(STATE_EVENT(pane), state)
}

/** Pane window: subscribe to state broadcasts from the main window. Returns an unsubscribe fn. */
export async function listenPaneState<T>(pane: PaneId, onState: (state: T) => void): Promise<() => void> {
  const { listen } = await import('@tauri-apps/api/event')
  const unlisten = await listen<T>(STATE_EVENT(pane), (event) => onState(event.payload))
  return unlisten
}

/** Pane window: forward a user action (button click, edit, ...) back to the main window. */
export async function sendPaneAction(pane: PaneId, action: unknown): Promise<void> {
  const { emit } = await import('@tauri-apps/api/event')
  await emit(ACTION_EVENT(pane), action)
}

/** Main window: receive actions forwarded from a pane's detached window. */
export async function onPaneAction<T>(pane: PaneId, onAction: (action: T) => void): Promise<() => void> {
  const { listen } = await import('@tauri-apps/api/event')
  const unlisten = await listen<T>(ACTION_EVENT(pane), (event) => onAction(event.payload))
  return unlisten
}

/** Pane window: tell the main window it was closed, so the panel can dock back in. */
export async function notifyPaneClosed(pane: PaneId): Promise<void> {
  const { emit } = await import('@tauri-apps/api/event')
  await emit(CLOSED_EVENT(pane), null)
}

/** Main window: learn that a detached pane window closed. */
export async function onPaneClosed(pane: PaneId, onClosed: () => void): Promise<() => void> {
  const { listen } = await import('@tauri-apps/api/event')
  const unlisten = await listen(CLOSED_EVENT(pane), () => onClosed())
  return unlisten
}

const PANE_TITLES: Record<PaneId, string> = {
  boq: 'IFClite — Bill of Quantities',
  buildup: 'IFClite — Assembly build-up',
  chat: 'IFClite — Estimator agent',
}

/** Main window: open (or focus) the detached window for a pane. */
export async function openPaneWindow(pane: PaneId): Promise<void> {
  const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow')
  const label = paneWindowLabel(pane)
  const existing = await WebviewWindow.getByLabel(label)
  if (existing) {
    await existing.setFocus()
    return
  }
  const url = `${window.location.pathname}?pane=${pane}`
  const win = new WebviewWindow(label, {
    url,
    title: PANE_TITLES[pane],
    width: 520,
    height: 760,
    minWidth: 380,
    minHeight: 420,
  })
  win.once('tauri://error', (event) => {
    console.error(`[pane] failed to open window for '${pane}'`, event)
  })
}

/** Main window: close a pane's detached window (e.g. because the panel docked back in). */
export async function closePaneWindow(pane: PaneId): Promise<void> {
  const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow')
  const existing = await WebviewWindow.getByLabel(paneWindowLabel(pane))
  await existing?.close()
}

export function readPaneIdFromLocation(): PaneId | null {
  const value = new URLSearchParams(window.location.search).get('pane')
  return value === 'boq' || value === 'buildup' || value === 'chat' ? value : null
}
