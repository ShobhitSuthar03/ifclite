import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { ThemeProvider } from '@/components/theme-provider'
import { warmupGeometryEngine } from '@/lib/ifc-loader'
import { isDesktopShell } from '@/lib/host'
import './index.css'

if (!isDesktopShell()) {
  const later =
    typeof requestIdleCallback === 'function'
      ? (work: () => void) => requestIdleCallback(work, { timeout: 2500 })
      : (work: () => void) => window.setTimeout(work, 1200)
  later(() => warmupGeometryEngine())
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>,
)

requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    const splash = document.getElementById('splash')
    if (!splash) return
    splash.classList.add('splash-hidden')
    window.setTimeout(() => splash.remove(), 400)
  })
})
