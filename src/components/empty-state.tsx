import { FolderPlus, FolderOpen, Upload, Box } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { ProjectRecord } from '@/lib/projects'

type EmptyStateProps = {
  onOpen: () => void
  dragActive: boolean
  busy?: boolean
  projectsEnabled?: boolean
  projectsRoot?: string | null
  projects?: ProjectRecord[]
  currentProject?: ProjectRecord | null
  hasOpenModel?: boolean
  onCreateProject?: (name: string) => void
  onOpenProject?: (id: string) => void
  onCloseProject?: () => void
  onBackToViewer?: () => void
}

export function EmptyState({
  onOpen,
  dragActive,
  busy = false,
  projectsEnabled = false,
  projectsRoot,
  projects = [],
  currentProject,
  hasOpenModel = false,
  onCreateProject,
  onOpenProject,
  onCloseProject,
  onBackToViewer,
}: EmptyStateProps) {
  if (!projectsEnabled) {
    return (
      <div
        className={cn(
          'flex h-full flex-col items-center justify-center gap-6 px-6 text-center',
          dragActive
            ? 'bg-primary/20 ring-2 ring-primary/50 ring-inset'
            : 'bg-[radial-gradient(circle_at_center,var(--viewport-mid)_0%,var(--viewport)_100%)]',
        )}
      >
        <div className="max-w-md space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">IFClite</p>
          <h2 className="text-[24px] font-semibold tracking-tight">Open an IFC file</h2>
          <p className="text-[14px] leading-relaxed text-muted-foreground">
            Drop a file here or choose one from disk. Project folders are available in the desktop app.
          </p>
        </div>
        <Button size="lg" onClick={onOpen} disabled={busy}>
          <Upload className="h-4 w-4" />
          Open IFC
        </Button>
      </div>
    )
  }

  const folder = projectsRoot ?? 'Documents\\IFCLite'
  const waitingForIfc = Boolean(currentProject && !currentProject.fileName)
  const canDrop = Boolean(currentProject)

  return (
    <div
      className={cn(
        'flex h-full min-h-0 flex-col bg-background lg:flex-row',
        dragActive && canDrop && 'ring-2 ring-primary/50 ring-inset',
      )}
    >
      <aside className="w-full shrink-0 overflow-auto border-b border-border p-6 lg:w-[360px] lg:border-b-0 lg:border-r">
        <div className="mb-6 space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">Projects</p>
          <h2 className="text-[22px] font-semibold tracking-tight">Your workspace</h2>
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            Create a project, upload an IFC, then close and reopen it later.
          </p>
          <p className="truncate font-mono text-[11px] text-muted-foreground">{folder}</p>
        </div>

        <section className="space-y-3">
          <h3 className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
            New project
          </h3>
          <ProjectCreateForm onCreate={(name) => onCreateProject?.(name)} disabled={busy || !onCreateProject} />
        </section>

        {waitingForIfc ? (
          <section className="mt-8 space-y-3">
            <h3 className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
              Upload IFC
            </h3>
            <button
              type="button"
              onClick={onOpen}
              disabled={busy}
              className={cn(
                'flex w-full flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-8 text-center',
                dragActive
                  ? 'border-primary bg-primary/10'
                  : 'border-border bg-card hover:border-primary/60 hover:bg-accent/40',
              )}
            >
              <Upload className="h-5 w-5 text-primary" />
              <span className="text-[14px] font-medium">Upload IFC to {currentProject?.name}</span>
              <span className="text-[12px] text-muted-foreground">Drop a file here or click to browse</span>
            </button>
            {onCloseProject ? (
              <Button variant="outline" className="w-full" onClick={onCloseProject} disabled={busy}>
                Close project
              </Button>
            ) : null}
          </section>
        ) : currentProject ? (
          <section className="mt-8 space-y-3">
            <h3 className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
              Current project
            </h3>
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="truncate text-[14px] font-medium">{currentProject.name}</p>
              <p className="mt-1 truncate text-[12px] text-muted-foreground">
                {currentProject.fileName ?? 'No IFC yet'}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {hasOpenModel && onBackToViewer ? (
                  <Button size="sm" onClick={onBackToViewer}>
                    Back to 3D
                  </Button>
                ) : currentProject.fileName && onOpenProject ? (
                  <Button size="sm" onClick={() => onOpenProject(currentProject.id)} disabled={busy}>
                    Open in 3D
                  </Button>
                ) : null}
                <Button size="sm" variant="outline" onClick={onOpen} disabled={busy}>
                  Replace IFC
                </Button>
                {onCloseProject ? (
                  <Button size="sm" variant="ghost" onClick={onCloseProject} disabled={busy}>
                    Close
                  </Button>
                ) : null}
              </div>
            </div>
          </section>
        ) : null}
      </aside>

      <main className="min-h-0 flex-1 overflow-auto p-6">
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <h3 className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
            Saved projects
          </h3>
          <span className="text-[12px] text-muted-foreground">
            {projects.length === 0 ? 'None yet' : `${projects.length} saved`}
          </span>
        </div>

        {projects.length === 0 ? (
          <div className="flex h-[min(320px,50vh)] flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card/40 px-6 text-center">
            <Box className="mb-3 h-8 w-8 text-muted-foreground" />
            <p className="text-[14px] font-medium">No projects yet</p>
            <p className="mt-1 max-w-sm text-[13px] text-muted-foreground">
              Name a project on the left, then upload an IFC. You can close it and reopen it from this list.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
            {projects.map((item) => {
              const active = currentProject?.id === item.id
              const action = item.fileName ? 'Open' : 'Continue'
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onOpenProject?.(item.id)}
                    className={cn(
                      'flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-accent',
                      active && 'bg-accent',
                    )}
                  >
                    <FolderOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-medium">{item.name}</span>
                      <span className="block truncate text-[12px] text-muted-foreground">
                        {item.fileName ?? 'No IFC yet'}
                        {item.updatedAtMs ? ` · ${formatProjectDate(item.updatedAtMs)}` : ''}
                      </span>
                    </span>
                    <span className="shrink-0 text-[12px] font-medium text-primary">{action}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </main>
    </div>
  )
}

function formatProjectDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function ProjectCreateForm({
  onCreate,
  disabled,
}: {
  onCreate: (name: string) => void
  disabled: boolean
}) {
  return (
    <form
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault()
        const form = event.currentTarget
        const input = form.elements.namedItem('projectName') as HTMLInputElement
        const name = input.value.trim()
        if (!name) return
        onCreate(name)
        input.value = ''
      }}
    >
      <input
        name="projectName"
        type="text"
        required
        autoFocus
        placeholder="Project name"
        disabled={disabled}
        className="h-10 w-full rounded-md border border-border bg-background px-3 text-[13px] outline-none focus:border-primary"
      />
      <Button type="submit" className="w-full" disabled={disabled}>
        <FolderPlus className="h-4 w-4" />
        Create project
      </Button>
    </form>
  )
}
