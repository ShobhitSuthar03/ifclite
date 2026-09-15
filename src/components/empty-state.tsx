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

  return (
    <div
      className={cn(
        'flex h-full flex-col items-center justify-center gap-5 px-6 text-center',
        dragActive
          ? 'bg-primary/20 ring-2 ring-primary/50 ring-inset'
          : 'bg-[radial-gradient(circle_at_center,var(--viewport-mid)_0%,var(--viewport)_100%)]',
      )}
    >
      <div className="max-w-lg space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
          {projectsEnabled ? 'Documents / IFCLite' : 'IFClite'}
        </p>
        <h2 className="text-[22px] font-semibold">
          {needsProject
            ? 'Projects'
            : currentProject
              ? currentProject.name
              : 'Drop an IFC onto the viewport'}
        </h2>
        <p className="text-[13px] text-muted-foreground">
          {needsProject
            ? `Create a project first. Files are stored in ${projectsRoot ?? 'Documents\\IFCLite'} so geometry and reports survive the next launch.`
            : currentProject
              ? `This project folder is ready. Load an IFC (it is copied into the project). Next time, open the project from this screen.`
              : 'Geometry streams into the scene while the parser builds the spatial tree and property sets. Project folders only appear in the Native Tauri window, not in a browser tab.'}
        </p>
      </div>

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
            className="inline-flex h-9 items-center gap-2 rounded bg-primary px-4 text-[13px] font-medium text-white"
          >
            <Upload className="h-4 w-4" />
            Load IFC
          </button>
          <button
            type="button"
            onClick={onSample}
            className="inline-flex h-9 items-center rounded border border-border px-4 text-[13px]"
          >
            Load two-wall sample
          </button>
          {onDismiss ? (
            <button
              type="button"
              onClick={onDismiss}
              className="inline-flex h-9 items-center rounded border border-border px-4 text-[13px]"
            >
              Back to model
            </button>
          ) : null}
        </div>
      )}

      {projectsEnabled && projects.length > 0 ? (
        <div className="w-full max-w-lg space-y-2 text-left">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Recent projects
          </p>
          <ul className="max-h-56 overflow-auto rounded border border-border bg-card">
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
                    {project.fileName ?? 'No model yet'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : projectsEnabled ? (
        <p className="text-[12px] text-muted-foreground">No projects yet — enter a name above.</p>
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
      className="flex w-full max-w-lg flex-wrap items-center justify-center gap-2"
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
        className="h-9 min-w-48 flex-1 rounded border border-border bg-background px-3 text-[13px] outline-none focus:border-primary"
      />
      <button
        type="submit"
        disabled={disabled}
        className="inline-flex h-9 items-center gap-2 rounded bg-primary px-4 text-[13px] font-medium text-white disabled:opacity-50"
      >
        <FolderPlus className="h-4 w-4" />
        Create project
      </button>
    </form>
  )
}
