import { FolderPlus, FolderOpen, Upload } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ProjectRecord } from '@/lib/projects'

type EmptyStateProps = {
  onOpen: () => void
  onSample: () => void
  dragActive: boolean
  projectsEnabled?: boolean
  projectsRoot?: string | null
  projects?: ProjectRecord[]
  currentProject?: ProjectRecord | null
  onCreateProject?: (name: string) => void
  onOpenProject?: (id: string) => void
  onDismiss?: () => void
}

export function EmptyState({
  onOpen,
  onSample,
  dragActive,
  projectsEnabled = false,
  projectsRoot,
  projects = [],
  currentProject,
  onCreateProject,
  onOpenProject,
  onDismiss,
}: EmptyStateProps) {
  const needsProject = projectsEnabled && !currentProject
  const folder = projectsRoot ?? 'Documents\\IFCLite'

  return (
    <div
      className={cn(
        'flex h-full flex-col items-center justify-center gap-6 px-6 text-center',
        dragActive
          ? 'bg-primary/20 ring-2 ring-primary/50 ring-inset'
          : 'bg-[radial-gradient(circle_at_center,var(--viewport-mid)_0%,var(--viewport)_100%)]',
      )}
    >
      <div className="max-w-xl space-y-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">IFClite Desktop</p>
        <h2 className="text-[24px] font-semibold tracking-tight">
          {needsProject ? 'Start a project' : currentProject ? `Add a model to ${currentProject.name}` : 'Open an IFC model'}
        </h2>
        <p className="text-[14px] leading-relaxed text-muted-foreground">
          {needsProject
            ? `Give the job a name. Everything for it — the IFC copy, 3D cache, and reports — is saved in ${folder}. Next time, click the project in the list. You do not start from a blank viewer.`
            : currentProject
              ? 'Step 2 of 2: open an IFC. The file is copied into this project. The first open builds 3D; later opens reuse that saved 3D.'
              : 'Drop an IFC here or use Open IFC. Project folders (Documents\\IFCLite) only appear in the desktop app, not in a browser tab.'}
        </p>
      </div>

      {needsProject ? (
        <ol className="w-full max-w-xl space-y-2 text-left text-[13px] text-muted-foreground">
          <li className="rounded-md border border-primary/40 bg-card px-3 py-2 text-foreground">
            <span className="mr-2 font-semibold text-primary">1</span>
            Type a project name and click Create project
          </li>
          <li className="rounded-md border border-border bg-card/60 px-3 py-2">
            <span className="mr-2 font-semibold text-foreground">2</span>
            Open an IFC (or drop it on this screen)
          </li>
          <li className="rounded-md border border-border bg-card/60 px-3 py-2">
            <span className="mr-2 font-semibold text-foreground">3</span>
            Work in 3D — it is stored under this project
          </li>
        </ol>
      ) : null}

      {needsProject ? (
        <ProjectCreateForm
          onCreate={(name) => onCreateProject?.(name)}
          disabled={!onCreateProject}
        />
      ) : (
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={onOpen}
            className="inline-flex h-10 items-center gap-2 rounded bg-primary px-4 text-[13px] font-medium text-white"
          >
            <Upload className="h-4 w-4" />
            Open IFC file
          </button>
          <button
            type="button"
            onClick={onSample}
            className="inline-flex h-10 items-center rounded border border-border px-4 text-[13px]"
          >
            Try the two-wall demo
          </button>
          {onDismiss ? (
            <button
              type="button"
              onClick={onDismiss}
              className="inline-flex h-10 items-center rounded border border-border px-4 text-[13px]"
            >
              Return to 3D view
            </button>
          ) : null}
        </div>
      )}

      {projectsEnabled && projects.length > 0 ? (
        <div className="w-full max-w-xl space-y-2 text-left">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Open a saved project
          </p>
          <ul className="max-h-56 overflow-auto rounded-md border border-border bg-card">
            {projects.map((project) => (
              <li key={project.id}>
                <button
                  type="button"
                  onClick={() => onOpenProject?.(project.id)}
                  className={cn(
                    'flex w-full items-center gap-2 px-3 py-2.5 text-left text-[13px] hover:bg-accent',
                    currentProject?.id === project.id && 'bg-accent',
                  )}
                >
                  <FolderOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate font-medium">{project.name}</span>
                  <span className="truncate text-[11px] text-muted-foreground">
                    {project.fileName ? `Open ${project.fileName}` : 'No IFC yet'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : projectsEnabled && needsProject ? (
        <p className="text-[12px] text-muted-foreground">No saved projects yet.</p>
      ) : null}
    </div>
  )
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
      className="flex w-full max-w-xl flex-wrap items-center justify-center gap-2"
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
        placeholder="e.g. Tower A – Level 3"
        disabled={disabled}
        className="h-10 min-w-48 flex-1 rounded border border-border bg-background px-3 text-[13px] outline-none focus:border-primary"
      />
      <button
        type="submit"
        disabled={disabled}
        className="inline-flex h-10 items-center gap-2 rounded bg-primary px-4 text-[13px] font-medium text-white disabled:opacity-50"
      >
        <FolderPlus className="h-4 w-4" />
        Create project
      </button>
    </form>
  )
}
