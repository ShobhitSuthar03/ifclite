import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import { isDesktopShell } from '@/lib/host'

export async function pickScheduleFile(): Promise<{ name: string; bytes: Uint8Array } | null> {
  if (isDesktopShell()) {
    const selected = await open({
      multiple: false,
      filters: [
        { name: 'Schedule', extensions: ['xml', 'csv', 'txt'] },
        { name: 'All files', extensions: ['*'] },
      ],
    })
    if (typeof selected !== 'string' || selected.length === 0) return null
    const buffer = await invoke<ArrayBuffer>('read_ifc_bytes', { path: selected })
    return { name: selected.split(/[/\\]/).pop() ?? 'schedule.xml', bytes: new Uint8Array(buffer) }
  }
  return pickScheduleFileInBrowser()
}

function pickScheduleFileInBrowser(): Promise<{ name: string; bytes: Uint8Array } | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.xml,.csv,.txt,.mpp'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) {
        resolve(null)
        return
      }
      resolve({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) })
    }
    input.click()
  })
}
