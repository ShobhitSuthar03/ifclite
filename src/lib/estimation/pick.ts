import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import { isDesktopShell } from '@/lib/host'

export type PickedBoqFile = { path: string; bytes: Uint8Array; name: string }

async function readLocalBytes(path: string): Promise<Uint8Array> {
  const buffer = await invoke<ArrayBuffer>('read_ifc_bytes', { path })
  return new Uint8Array(buffer)
}

function pickInBrowser(accept: string): Promise<PickedBoqFile | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) {
        resolve(null)
        return
      }
      resolve({ path: file.name, name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) })
    }
    input.click()
  })
}

export async function pickBoqXmlFile(): Promise<PickedBoqFile | null> {
  if (isDesktopShell()) {
    const selected = await open({
      multiple: false,
      filters: [
        { name: 'iTWO Element Planning', extensions: ['xml'] },
        { name: 'All files', extensions: ['*'] },
      ],
    })
    if (typeof selected !== 'string' || selected.length === 0) return null
    return {
      path: selected,
      name: selected.split(/[/\\]/).pop() ?? selected,
      bytes: await readLocalBytes(selected),
    }
  }
  return pickInBrowser('.xml')
}

export async function pickBoqCsvFile(): Promise<PickedBoqFile | null> {
  if (isDesktopShell()) {
    const selected = await open({
      multiple: false,
      filters: [
        { name: 'BOQ CSV', extensions: ['csv', 'txt'] },
        { name: 'All files', extensions: ['*'] },
      ],
    })
    if (typeof selected !== 'string' || selected.length === 0) return null
    return {
      path: selected,
      name: selected.split(/[/\\]/).pop() ?? selected,
      bytes: await readLocalBytes(selected),
    }
  }
  return pickInBrowser('.csv,.txt')
}
