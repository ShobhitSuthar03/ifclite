import type { LoadProgress } from '@/lib/ifc-loader'
import { formatCount } from '@/lib/utils'

type LoadingOverlayProps = {
  progress: LoadProgress | null
  parsing: boolean
  fileName?: string | null
}

export function LoadingOverlay({ progress, parsing, fileName }: LoadingOverlayProps) {
  const processed = progress?.processed ?? 0
  const total = progress?.total ?? 0
  const ratio = total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : progress ? 12 : 8

  const title = progress?.cacheHit
    ? 'Opening saved 3D'
    : progress?.phase === 'init'
      ? 'Starting the 3D engine'
      : progress?.phase === 'cache-lookup'
        ? 'Looking for a saved 3D cache'
        : progress?.phase === 'geometry'
          ? 'Building the 3D model'
          : 'Opening IFC'

  const detail = progress?.cacheHit
    ? 'This file was processed before. Loading triangles from the project folder.'
    : parsing && (progress?.phase === 'geometry' || progress?.phase === 'complete')
      ? '3D is appearing. Property sets and the building tree are still being indexed.'
      : 'The first open of a file is slower. The next open of the same file reuses the cache.'

  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-background/80 px-6 text-center backdrop-blur-[2px]">
      <div className="w-full max-w-md space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">Please wait</p>
        <h2 className="text-[18px] font-semibold">{title}</h2>
        {fileName ? <p className="truncate text-[13px] text-foreground">{fileName}</p> : null}
        <p className="text-[13px] text-muted-foreground">{detail}</p>
      </div>
      <div className="h-1.5 w-64 overflow-hidden rounded-full bg-secondary">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.max(ratio, 8)}%` }} />
      </div>
      {total > 0 ? (
        <p className="text-[12px] text-muted-foreground">
          {formatCount(processed)} of {formatCount(total)} elements in 3D
        </p>
      ) : null}
    </div>
  )
}
