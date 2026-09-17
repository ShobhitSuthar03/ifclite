import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import { parseCostAssemblyBytes } from '@/lib/cost-assembly/parse'
import type { CostAssemblyCatalog } from '@/lib/cost-assembly/types'
import { isDesktopShell } from '@/lib/host'

export const DEFAULT_COST_ASSEMBLY_PATH =
  'C:\\Users\\Shobhit_S\\OneDrive - verstraetebouw.be\\Documents\\IFCLite\\Cost Assembly Store\\Cost Assembly.xml'

export type LocalFileStat = {
  exists: boolean
  size: number
  modifiedMs: number
}

export async function statLocalFile(path: string): Promise<LocalFileStat> {
  if (!isDesktopShell()) return { exists: false, size: 0, modifiedMs: 0 }
  return invoke<LocalFileStat>('stat_local_file', { path })
}

export async function readLocalBytes(path: string): Promise<Uint8Array> {
  if (!isDesktopShell()) {
    throw new Error('The Cost Assembly Store is available in the desktop app.')
  }
  const buffer = await invoke<ArrayBuffer>('read_ifc_bytes', { path })
  return new Uint8Array(buffer)
}

export async function loadCostAssemblyCatalog(path = DEFAULT_COST_ASSEMBLY_PATH): Promise<CostAssemblyCatalog> {
  const stat = await statLocalFile(path)
  if (isDesktopShell() && !stat.exists) {
    throw new Error(`Cost assembly file not found:\n${path}`)
  }
  const bytes = await readLocalBytes(path)
  const name = path.split(/[/\\]/).pop() ?? 'Cost Assembly.xml'
  return parseCostAssemblyBytes(bytes, { path, name, modifiedMs: stat.modifiedMs })
}

export async function pickCostAssemblyFile(): Promise<{ path: string; bytes: Uint8Array } | null> {
  if (isDesktopShell()) {
    const selected = await open({
      multiple: false,
      filters: [
        { name: 'Cost assembly', extensions: ['xml'] },
        { name: 'All files', extensions: ['*'] },
      ],
    })
    if (typeof selected !== 'string' || selected.length === 0) return null
    return { path: selected, bytes: await readLocalBytes(selected) }
  }
  return pickCostAssemblyInBrowser()
}

function pickCostAssemblyInBrowser(): Promise<{ path: string; bytes: Uint8Array } | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.xml'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) {
        resolve(null)
        return
      }
      resolve({ path: file.name, bytes: new Uint8Array(await file.arrayBuffer()) })
    }
    input.click()
  })
}

export function parsePickedCostAssembly(file: { path: string; bytes: Uint8Array }): CostAssemblyCatalog {
  const name = file.path.split(/[/\\]/).pop() ?? 'Cost Assembly.xml'
  return parseCostAssemblyBytes(file.bytes, { path: file.path, name, modifiedMs: Date.now() })
}
