import { GeometryProcessor, type CoordinateInfo, type MeshData, type StreamingGeometryEvent } from '@ifc-lite/geometry'
import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import { meshesToViewerFrame } from '@/lib/coordinates'
import { sha256Hex } from '@/lib/hash'
import { isDesktopShell as isTauri } from '@/lib/host'

export type LoadSource =
  | { kind: 'buffer'; name: string; bytes: Uint8Array }
  | {
      kind: 'path'
      name: string
      path: string
      bytes?: Uint8Array
      sizeBytes?: number
      cacheKey?: string
      skipParse?: boolean
    }

export type NativeCacheManifest = {
  version: number
  totalMeshes: number
  totalVertices: number
  totalTriangles: number
  shardCount: number
  metadataSnapshotSize: number
}

export type LoadProgress = {
  phase: 'init' | 'cache-lookup' | 'geometry' | 'complete'
  processed: number
  total: number
  cacheHit: boolean
  pipeline: 'native-cache' | 'native-path' | 'native-buffer' | 'wasm'
}

export type LoadResult = {
  meshes: MeshData[]
  fileName: string
  fileBytes: number
  cacheKey: string
  cacheHit: boolean
  pipeline: LoadProgress['pipeline']
  totalMeshes: number
  elapsedMs: number
  coordinateInfo?: CoordinateInfo
}

export type GeometryEngineStatus = 'cold' | 'loading' | 'ready' | 'error'

let processorPromise: Promise<GeometryProcessor> | null = null
let engineStatus: GeometryEngineStatus = 'cold'
const engineListeners = new Set<(status: GeometryEngineStatus) => void>()
let processorNeedsRecycle = false

function setEngineStatus(next: GeometryEngineStatus) {
  engineStatus = next
  for (const listener of engineListeners) listener(next)
}

export function getGeometryEngineStatus(): GeometryEngineStatus {
  return engineStatus
}

export function subscribeGeometryEngine(listener: (status: GeometryEngineStatus) => void) {
  engineListeners.add(listener)
  listener(engineStatus)
  return () => {
    engineListeners.delete(listener)
  }
}

export async function recycleGeometryProcessor(): Promise<void> {
  const pending = processorPromise
  processorPromise = null
  setEngineStatus('cold')
  if (!pending) return
  try {
    const processor = await pending
    processor.dispose()
  } catch {
    // A poisoned or failed instance is dropped; the next init builds a fresh IfcAPI.
  }
}

export function getGeometryProcessor(): Promise<GeometryProcessor> {
  if (!processorPromise) {
    setEngineStatus('loading')
    const started = performance.now()
    processorPromise = (async () => {
      try {
        const processor = new GeometryProcessor({
          preferNative: true,
          enableInstancing: false,
          skipSmallCuts: true,
        })
        await processor.init()
        console.info(`[geometry] engine ready in ${Math.round(performance.now() - started)}ms`)
        setEngineStatus('ready')
        return processor
      } catch (error) {
        processorPromise = null
        setEngineStatus('error')
        throw error
      }
    })()
  }
  return processorPromise
}

/** Fetch + compile the ~4 MB WASM engine before the user opens a file. */
export function warmupGeometryEngine() {
  void getGeometryProcessor().catch((error) => {
    console.warn('[geometry] engine warmup failed; a later load will retry', error)
  })
}

export async function pickIfcFile(): Promise<LoadSource | null> {
  if (isTauri()) {
    const selected = await open({
      multiple: false,
      filters: [{ name: 'IFC models', extensions: ['ifc', 'ifczip'] }],
    })
    if (typeof selected !== 'string' || selected.length === 0) return null
    const path = selected
    const name = path.split(/[/\\]/).pop() ?? 'model.ifc'
    return { kind: 'path', name, path }
  }

  return pickIfcFileInBrowser()
}

export function pickIfcFileInBrowser(): Promise<LoadSource | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.ifc,.ifczip,application/x-step'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) {
        resolve(null)
        return
      }
      const bytes = new Uint8Array(await file.arrayBuffer())
      resolve({ kind: 'buffer', name: file.name, bytes })
    }
    input.click()
  })
}

export async function loadIfcModel(
  source: LoadSource,
  onProgress: (progress: LoadProgress) => void,
  onBatch: (meshes: MeshData[]) => void,
  signal?: AbortSignal,
): Promise<LoadResult> {
  const started = performance.now()
  if (getGeometryEngineStatus() !== 'ready') {
    onProgress({
      phase: 'init',
      processed: 0,
      total: 0,
      cacheHit: false,
      pipeline: isTauri() ? 'native-buffer' : 'wasm',
    })
  }

  // Recycle only after a previous tessellation so warmup still shares the first IfcAPI.
  if (processorNeedsRecycle) {
    await recycleGeometryProcessor()
    processorNeedsRecycle = false
  }
  const processor = await getGeometryProcessor()
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')

  const path = source.kind === 'path' ? source.path : null
  const bytes: Uint8Array | null = source.kind === 'buffer' ? source.bytes : (source.bytes ?? null)
  const cacheKey =
    (source.kind === 'path' ? source.cacheKey : undefined) ??
    (bytes != null ? await sha256Hex(bytes) : await invoke<string>('hash_ifc_path', { path: path ?? '' }))
  const fileBytes =
    source.kind === 'buffer' ? source.bytes.byteLength : (source.sizeBytes ?? bytes?.byteLength ?? 0)

  let pipeline: LoadProgress['pipeline'] = 'wasm'
  let cacheHit = false
  const collected: MeshData[] = []
  let totalMeshes = 0
  let coordinateInfo: CoordinateInfo | undefined

  const handleEvent = (event: StreamingGeometryEvent) => {
    if (event.type === 'batch') {
      const meshes = meshesToViewerFrame(event.meshes, pipeline)
      collected.push(...meshes)
      onBatch(meshes)
      if (event.coordinateInfo) coordinateInfo = event.coordinateInfo
      onProgress({
        phase: 'geometry',
        processed: event.totalSoFar,
        total: Math.max(event.totalSoFar, totalMeshes),
        cacheHit,
        pipeline,
      })
    }
    if (event.type === 'complete') {
      totalMeshes = event.totalMeshes
      coordinateInfo = event.coordinateInfo ?? coordinateInfo
    }
  }

  try {
    if (isTauri()) {
      onProgress({
        phase: 'cache-lookup',
        processed: 0,
        total: 0,
        cacheHit: false,
        pipeline: 'native-buffer',
      })
      const manifest = await invoke<NativeCacheManifest | null>('get_native_geometry_cache_manifest', {
        cacheKey,
      })

      if (manifest) {
        cacheHit = true
        pipeline = 'native-cache'
        totalMeshes = manifest.totalMeshes
        onProgress({
          phase: 'geometry',
          processed: 0,
          total: manifest.totalMeshes,
          cacheHit: true,
          pipeline,
        })
        for await (const event of processor.processStreamingCache(cacheKey)) {
          if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
          handleEvent(event)
        }
      } else if (source.kind === 'path') {
        pipeline = 'native-path'
        onProgress({
          phase: 'geometry',
          processed: 0,
          total: 0,
          cacheHit: false,
          pipeline,
        })
        for await (const event of processor.processStreamingPath(source.path, fileBytes, cacheKey)) {
          if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
          handleEvent(event)
        }
      } else {
        pipeline = 'native-buffer'
        onProgress({
          phase: 'geometry',
          processed: 0,
          total: 0,
          cacheHit: false,
          pipeline,
        })
        const buffer = bytes ?? (await readPathBytes(path ?? ''))
        for await (const event of processor.processStreaming(buffer)) {
          if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
          handleEvent(event)
        }
      }
    } else {
      pipeline = 'wasm'
      const buffer = bytes ?? (await readPathBytes(path ?? ''))
      onProgress({
        phase: 'geometry',
        processed: 0,
        total: 0,
        cacheHit: false,
        pipeline,
      })
      for await (const event of processor.processAdaptive(buffer, { sizeThreshold: 512 * 1024 })) {
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
        handleEvent(event)
      }
    }
  } catch (error) {
    processorNeedsRecycle = false
    await recycleGeometryProcessor()
    throw error
  }

  processorNeedsRecycle = !cacheHit

  onProgress({
    phase: 'complete',
    processed: collected.length,
    total: totalMeshes || collected.length,
    cacheHit,
    pipeline,
  })

  return {
    meshes: collected,
    fileName: source.name,
    fileBytes,
    cacheKey,
    cacheHit,
    pipeline,
    totalMeshes: totalMeshes || collected.length,
    elapsedMs: Math.round(performance.now() - started),
    coordinateInfo,
  }
}

export async function resolveSourceBytes(source: LoadSource): Promise<ArrayBuffer> {
  const bytes = source.kind === 'buffer' ? source.bytes : (source.bytes ?? (await readPathBytes(source.path)))
  const copy = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(copy).set(bytes)
  return copy
}

async function readPathBytes(path: string): Promise<Uint8Array> {
  // read_ifc_bytes returns a raw IPC response (ArrayBuffer), not a JSON number
  // array - avoids a hugely expensive JSON encode/decode for large IFC files.
  const buffer = await invoke<ArrayBuffer>('read_ifc_bytes', { path })
  return new Uint8Array(buffer)
}
