import { invoke } from '@tauri-apps/api/core'
import { isDesktopShell } from '@/lib/host'
import { persistableQuantities } from '@/lib/project-session'
import type { EstimationDoc } from '@/lib/estimation'
import type { QuantityResult } from '@/lib/geometry-qto'
import type { PropertyTreeNode } from '@/lib/property-tree'
import type { CatalogSummary, EstimatorSyncSnapshot, PropertySearchResult, SkipHint, ToolResult } from '@/lib/estimator-tools'

export type McpStartResult = {
  port: number
  syncPort: number
  token: string
  url: string
  pid: number
}

export type McpHealth = {
  ok: boolean
  ready: boolean
  loading: boolean
  error: string | null
  mcp: string
  revision: number
}

const HEADERS = { 'Content-Type': 'application/json' }

export function syncBase(syncPort: number): string {
  return `http://127.0.0.1:${syncPort}`
}

export async function startMcpHost(args: {
  ifcPath: string
  catalogPath?: string | null
  sessionPath?: string | null
  quantitiesPath?: string | null
  port?: number
}): Promise<McpStartResult> {
  if (!isDesktopShell()) throw new Error('MCP sidecar is desktop-only.')
  return invoke<McpStartResult>('start_mcp_host', {
    ifcPath: args.ifcPath,
    catalogPath: args.catalogPath ?? null,
    sessionPath: args.sessionPath ?? null,
    quantitiesPath: args.quantitiesPath ?? null,
    port: args.port ?? 8765,
  })
}

export async function stopMcpHost(): Promise<void> {
  if (!isDesktopShell()) return
  await invoke('stop_mcp_host')
}

export async function fetchMcpHealth(syncPort: number): Promise<McpHealth> {
  const response = await fetch(`${syncBase(syncPort)}/health`)
  if (!response.ok) throw new Error(`MCP health ${response.status}`)
  return (await response.json()) as McpHealth
}

export async function waitForMcpReady(syncPort: number, timeoutMs = 90_000): Promise<McpHealth> {
  const started = Date.now()
  let last: Error | null = null
  while (Date.now() - started < timeoutMs) {
    try {
      const health = await fetchMcpHealth(syncPort)
      if (health.ready) return health
      if (health.error) throw new Error(health.error)
    } catch (caught) {
      last = caught instanceof Error ? caught : new Error(String(caught))
    }
    await new Promise((resolve) => window.setTimeout(resolve, 400))
  }
  throw last ?? new Error('MCP sidecar timed out while starting.')
}

export async function postEstimatorSync(
  syncPort: number,
  payload: {
    revision: number
    force?: boolean
    estimation?: EstimationDoc
    selectedIds?: number[]
    quantities?: QuantityResult | null
    previewTree?: PropertyTreeNode[]
    catalogPath?: string | null
    catalogSummary?: CatalogSummary | null
    elementHints?: SkipHint[]
    consumedViewer?: number
    searchResults?: PropertySearchResult | null
  },
): Promise<{ accepted: boolean; snapshot: EstimatorSyncSnapshot }> {
  const response = await fetch(`${syncBase(syncPort)}/sync`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({
      ...payload,
      quantities: payload.quantities !== undefined ? persistableQuantities(payload.quantities) : undefined,
    }),
  })
  if (!response.ok) throw new Error(`MCP sync POST ${response.status}`)
  return (await response.json()) as { accepted: boolean; snapshot: EstimatorSyncSnapshot }
}

export async function getEstimatorSync(syncPort: number): Promise<EstimatorSyncSnapshot> {
  const response = await fetch(`${syncBase(syncPort)}/sync`)
  if (!response.ok) throw new Error(`MCP sync GET ${response.status}`)
  return (await response.json()) as EstimatorSyncSnapshot
}

export async function callSidecarTool(
  syncPort: number,
  name: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const response = await fetch(`${syncBase(syncPort)}/tools`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ name, arguments: args }),
  })
  return (await response.json()) as ToolResult
}

export async function callSidecarBim(
  syncPort: number,
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  const response = await fetch(`${syncBase(syncPort)}/bim`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ name, arguments: args }),
  })
  const json = (await response.json()) as {
    result?: { content?: Array<{ text?: string }>; isError?: boolean }
    error?: { message?: string }
  }
  if (json.error?.message) return json.error.message
  const text = json.result?.content?.map((block) => block.text ?? '').filter(Boolean).join('\n')
  return text || JSON.stringify(json)
}

export async function callSidecarLlm(
  syncPort: number,
  body: Record<string, unknown>,
): Promise<{
  choices?: Array<{
    message?: {
      role?: string
      content?: string | null
      tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>
    }
  }>
  error?: { message?: string }
}> {
  let response: Response
  try {
    response = await fetch(`${syncBase(syncPort)}/llm`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify(body),
    })
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught)
    throw new Error(explainFetchFailure(syncPort, message))
  }
  const json = (await response.json().catch(() => null)) as {
    choices?: Array<{
      message?: {
        role?: string
        content?: string | null
        tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>
      }
    }>
    error?: { message?: string } | string
  } | null
  const errorMessage =
    typeof json?.error === 'string'
      ? json.error
      : json?.error && typeof json.error === 'object'
        ? json.error.message
        : null
  if (!response.ok) {
    throw new Error(errorMessage || `Estimator LLM proxy HTTP ${response.status}`)
  }
  if (errorMessage) throw new Error(errorMessage)
  return { choices: json?.choices }
}

function explainFetchFailure(syncPort: number, message: string): string {
  if (/failed to fetch|networkerror|load failed|fetch failed/i.test(message)) {
    return `Cannot reach the Estimator sidecar at http://127.0.0.1:${syncPort} (Failed to fetch). The agent can take off quantities and build a BOQ, but chat needs that sidecar. Wait until the status bar says MCP ready, or close extra IFCLite windows and reopen the project if port ${syncPort} is stuck.`
  }
  return message
}

export function joinProjectFile(folderPath: string, name: string): string {
  const slash = folderPath.includes('/') && !folderPath.includes('\\') ? '/' : '\\'
  return `${folderPath.replace(/[/\\]$/, '')}${slash}${name}`
}
