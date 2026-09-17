import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { PaneApp } from './pane-app.tsx'
import { ThemeProvider } from '@/components/theme-provider'
import { warmupGeometryEngine } from '@/lib/ifc-loader'
import { isDesktopShell } from '@/lib/host'
import { readPaneIdFromLocation } from '@/lib/pane-sync'
import './index.css'

const paneId = readPaneIdFromLocation()

if (!paneId && !isDesktopShell()) {
  const later =
    typeof requestIdleCallback === 'function'
      ? (work: () => void) => requestIdleCallback(work, { timeout: 2500 })
      : (work: () => void) => window.setTimeout(work, 1200)
  later(() => warmupGeometryEngine())
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>{paneId ? <PaneApp paneId={paneId} /> : <App />}</ThemeProvider>
  </StrictMode>,
)

const splash = document.getElementById('splash')
if (paneId && splash) {
  splash.remove()
} else {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (!splash) return
      splash.classList.add('splash-hidden')
      window.setTimeout(() => splash.remove(), 400)
    })
  })
}
