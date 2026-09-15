import { FolderOpen, Loader2, Box } from 'lucide-react'
import { ThemeSwitch } from '@/components/theme-switch'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { hostKind, hostLabel } from '@/lib/host'

type AppHeaderProps = {
  fileName: string | null
  busy: boolean
  onOpen: () => void
  onSample: () => void
  projectName?: string | null
  onProjects?: () => void
  canLoad?: boolean
}

export function AppHeader({
  fileName,
  busy,
  onOpen,
  onSample,
  projectName,
  onProjects,
  canLoad = true,
}: AppHeaderProps) {
  const kind = hostKind()

  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border bg-muted px-4">
      <div className="flex min-w-0 items-center gap-3">
        <Box className="h-[18px] w-[18px] shrink-0 text-primary" />
        <span className="text-[15px] font-semibold">IFClite</span>
      </div>
      <div className="hidden min-w-0 items-center gap-3 rounded bg-foreground/5 px-3 py-1 sm:flex">
        <FolderOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="max-w-64 truncate text-[13px]">
          {projectName ? `${projectName} · ${fileName ?? 'No model'}` : (fileName ?? 'No model loaded')}
        </span>
        <Badge className="rounded-[3px] border-0 bg-primary px-1.5 py-px text-[10px] font-semibold text-white normal-case">
          {hostLabel(kind)}
        </Badge>
      </div>
      <div className="flex items-center gap-2">
        <ThemeSwitch />
        {onProjects ? (
          <Button variant="outline" size="sm" onClick={onProjects} disabled={busy}>
            My projects
          </Button>
        ) : null}
        <Button variant="outline" size="sm" onClick={onSample} disabled={busy || !canLoad}>
          Demo
        </Button>
        <Button size="sm" onClick={onOpen} disabled={busy || !canLoad}>
          {busy ? <Loader2 className="animate-spin" /> : <FolderOpen />}
          {busy ? 'Opening…' : 'Open IFC'}
        </Button>
      </div>
    </header>
  )
}
