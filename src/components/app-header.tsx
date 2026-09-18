import { FolderOpen, Loader2, Download } from 'lucide-react'
import { ThemeSwitch } from '@/components/theme-switch'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { hostKind, hostLabel } from '@/lib/host'

type AppHeaderProps = {
  fileName: string | null
  busy: boolean
  onOpen: () => void
  projectName?: string | null
  onProjects?: () => void
  onCloseProject?: () => void
  onBackToViewer?: () => void
  canLoad?: boolean
  homeOpen?: boolean
  onExportIfc?: () => void
  exportBusy?: boolean
}

export function AppHeader({
  fileName,
  busy,
  onOpen,
  projectName,
  onProjects,
  onCloseProject,
  onBackToViewer,
  canLoad = true,
  homeOpen = false,
  onExportIfc,
  exportBusy = false,
}: AppHeaderProps) {
  const kind = hostKind()

  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border bg-muted px-4">
      <div className="flex min-w-0 items-center gap-2">
        <img src="/logo.png" alt="" className="h-6 w-6 shrink-0" />
        <span className="text-[15px] font-semibold">VERBIM</span>
      </div>
      <div className="hidden min-w-0 items-center gap-3 rounded bg-foreground/5 px-3 py-1 sm:flex">
        <FolderOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="max-w-64 truncate text-[13px]">
          {projectName ? `${projectName} · ${fileName ?? 'No model'}` : (fileName ?? 'No project')}
        </span>
        <Badge className="rounded-[3px] border-0 bg-primary px-1.5 py-px text-[10px] font-semibold text-white normal-case">
          {hostLabel(kind)}
        </Badge>
      </div>
      <div className="flex items-center gap-2">
        <ThemeSwitch />
        {homeOpen && onBackToViewer ? (
          <Button variant="outline" size="sm" onClick={onBackToViewer} disabled={busy}>
            Back to 3D
          </Button>
        ) : null}
        {!homeOpen && onProjects ? (
          <Button variant="outline" size="sm" onClick={onProjects} disabled={busy}>
            Projects
          </Button>
        ) : null}
        {onCloseProject ? (
          <Button variant="outline" size="sm" onClick={onCloseProject} disabled={busy}>
            Close project
          </Button>
        ) : null}
        {!homeOpen && onExportIfc ? (
          <Button
            variant="outline"
            size="sm"
            onClick={onExportIfc}
            disabled={busy || exportBusy}
            title="Bake registered properties and property edits into an exported .ifc file"
          >
            {exportBusy ? <Loader2 className="animate-spin" /> : <Download />}
            {exportBusy ? 'Exporting…' : 'Export IFC'}
          </Button>
        ) : null}
        {!homeOpen ? (
          <Button size="sm" onClick={onOpen} disabled={busy || !canLoad}>
            {busy ? <Loader2 className="animate-spin" /> : <FolderOpen />}
            {busy ? 'Opening…' : 'Open IFC'}
          </Button>
        ) : null}
      </div>
    </header>
  )
}
