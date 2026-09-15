import { invoke } from '@tauri-apps/api/core'
import { isDesktopShell } from '@/lib/host'
import { parseSessionJson, type ProjectSession } from '@/lib/project-session'

export type ProjectRecord = {
  id: string
  name: string
  folderPath: string
  createdAtMs: number
  updatedAtMs: number
  modelFile: string | null
  originalPath: string | null
  fileName: string | null
  cacheKey: string | null
}

export type ProjectSnapshot = ProjectRecord & {
  modelPath: string | null
  geometryDir: string
  sessionJson: string | null
  hasWarehouse: boolean
  hasQuantities: boolean
  hasGeometryCache: boolean
  project?: ProjectRecord
}

function flattenSnapshot(raw: ProjectSnapshot): ProjectSnapshot {
  const nested = raw.project
  if (!nested) return raw
  return {
    ...nested,
    ...raw,
    id: nested.id,
    name: nested.name,
    folderPath: nested.folderPath,
  }
}

export function projectsAvailable(): boolean {
  return isDesktopShell()
}

export async function getProjectsRoot(): Promise<string> {
  return invoke<string>('get_projects_root')
}

export async function listProjects(): Promise<ProjectRecord[]> {
  return invoke<ProjectRecord[]>('list_projects')
}

export async function lastProject(): Promise<ProjectRecord | null> {
  return invoke<ProjectRecord | null>('last_project')
}

export async function createProject(name: string): Promise<ProjectSnapshot> {
  return flattenSnapshot(await invoke<ProjectSnapshot>('create_project', { name }))
}

export async function openProject(id: string): Promise<ProjectSnapshot> {
  return flattenSnapshot(await invoke<ProjectSnapshot>('open_project', { id }))
}

export async function closeProject(): Promise<void> {
  await invoke('close_project')
}

export async function importIfcPath(path: string, fileName?: string): Promise<ProjectSnapshot> {
  return flattenSnapshot(
    await invoke<ProjectSnapshot>('import_ifc_path', { path, fileName: fileName ?? null }),
  )
}

export async function importIfcBytes(fileName: string, bytes: Uint8Array): Promise<ProjectSnapshot> {
  // Sent as a raw IPC body (not wrapped in a JSON object) so Tauri transfers it as
  // an octet-stream instead of a JSON array of numbers; the file name travels as a
  // header since the body is fully occupied by the file bytes.
  return flattenSnapshot(
    await invoke<ProjectSnapshot>('import_ifc_bytes', bytes, {
      headers: { 'x-file-name': encodeURIComponent(fileName) },
    }),
  )
}

export async function saveProjectSession(session: ProjectSession): Promise<void> {
  await invoke('save_project_session', { json: JSON.stringify(session) })
}

export async function saveProjectWarehouse(bytes: Uint8Array): Promise<void> {
  await invoke('save_project_warehouse', bytes)
}

/** Companion to saveProjectWarehouse; null if the project has no saved warehouse. */
export async function getProjectWarehouse(): Promise<Uint8Array | null> {
  try {
    const buffer = await invoke<ArrayBuffer>('get_project_warehouse')
    return new Uint8Array(buffer)
  } catch {
    return null
  }
}

/**
 * Full (per-face geometry included) quantity takeoff, persisted separately from
 * session.json so reopening a project doesn't need to recompute it - see
 * persistableQuantities() for why the copy embedded in the session is totals-only.
 */
export async function saveProjectQuantities(json: string): Promise<void> {
  await invoke('save_project_quantities', new TextEncoder().encode(json))
}

/** Companion to saveProjectQuantities; null if the project has no saved takeoff. */
export async function getProjectQuantities(): Promise<string | null> {
  try {
    const buffer = await invoke<ArrayBuffer>('get_project_quantities')
    return new TextDecoder().decode(buffer)
  } catch {
    return null
  }
}

export function sessionFromSnapshot(snapshot: ProjectSnapshot): ProjectSession | null {
  return parseSessionJson(snapshot.sessionJson)
}

/** Writes exported IFC bytes to an arbitrary path (e.g. chosen via a save dialog). */
export async function writeIfcFile(path: string, bytes: Uint8Array): Promise<void> {
  await invoke('write_ifc_file', bytes, {
    headers: { 'x-output-path': encodeURIComponent(path) },
  })
}
