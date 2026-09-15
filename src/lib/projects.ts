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
  warehouse: number[] | null
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
  return flattenSnapshot(
    await invoke<ProjectSnapshot>('import_ifc_bytes', { fileName, bytes: Array.from(bytes) }),
  )
}

export async function saveProjectSession(session: ProjectSession): Promise<void> {
  await invoke('save_project_session', { json: JSON.stringify(session) })
}

export async function saveProjectWarehouse(bytes: Uint8Array): Promise<void> {
  await invoke('save_project_warehouse', { bytes: Array.from(bytes) })
}

export function sessionFromSnapshot(snapshot: ProjectSnapshot): ProjectSession | null {
  return parseSessionJson(snapshot.sessionJson)
}

export function warehouseBytesFromSnapshot(snapshot: ProjectSnapshot): Uint8Array | null {
  if (!snapshot.warehouse || snapshot.warehouse.length === 0) return null
  return Uint8Array.from(snapshot.warehouse)
}
