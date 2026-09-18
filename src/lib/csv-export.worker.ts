import { GeometryProcessor } from '@ifc-lite/geometry'

/**
 * `GeometryProcessor.exportCsv` is one uninterruptible synchronous WASM call
 * that re-parses the whole IFC file and formats every row in one go - there's
 * no chunking hook to yield mid-call. Running it on the main thread froze the
 * window (worst on desktop, where a blocked JS thread hangs the whole native
 * WebView, not just a tab). Running it here instead keeps the UI responsive
 * regardless of how long the export takes.
 */

export type CsvWorkerRequest = {
  id: number
  bytes: Uint8Array
  mode: string
  delimiter: string
  includeProperties: boolean
}

export type CsvWorkerResponse = { id: number; ok: true; text: string } | { id: number; ok: false; error: string }

type WorkerScope = {
  onmessage: ((event: MessageEvent<CsvWorkerRequest>) => void) | null
  postMessage: (message: CsvWorkerResponse) => void
}

const scope = self as unknown as WorkerScope

let processorPromise: Promise<GeometryProcessor> | null = null

function getProcessor(): Promise<GeometryProcessor> {
  if (!processorPromise) {
    processorPromise = (async () => {
      const processor = new GeometryProcessor({ preferNative: false, enableInstancing: false })
      await processor.init()
      return processor
    })()
  }
  return processorPromise
}

scope.onmessage = async (event) => {
  const { id, bytes, mode, delimiter, includeProperties } = event.data
  try {
    const processor = await getProcessor()
    const raw = processor.exportCsv(
      bytes,
      mode as Parameters<GeometryProcessor['exportCsv']>[1],
      delimiter as Parameters<GeometryProcessor['exportCsv']>[2],
      includeProperties,
    )
    if (!raw) throw new Error('CSV export needs the WASM geometry engine. It is unavailable on this host.')
    // Decode to a string immediately - `raw` is a live view into WASM linear
    // memory, not an owned copy, so it must not survive past this call.
    const text = new TextDecoder().decode(raw)
    scope.postMessage({ id, ok: true, text })
  } catch (error) {
    scope.postMessage({ id, ok: false, error: error instanceof Error ? error.message : String(error) })
  }
}
