/**
 * IFCLite MCP sidecar — official @ifc-lite/mcp with the open model preloaded,
 * plus Cost Assembly / Estimation tools and a /sync + /llm HTTP surface for the app.
 *
 *   npx tsx --tsconfig tsconfig.mcp.json scripts/mcp-host.ts --ifc <model.ifc> --token <bearer>
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { timingSafeEqual } from 'node:crypto'
import {
  BearerTokenAuth,
  buildDefaultPromptRegistry,
  buildDefaultToolRegistry,
  createMCPServer,
  fullScope,
  HttpTransport,
  InMemoryModelRegistry,
  loadIfcModel,
  type CallToolResult,
  type JsonSchema,
  type MCPServer,
  type Prompt,
  type Tool,
} from '@ifc-lite/mcp'
import { parseCostAssemblyBytes } from '../src/lib/cost-assembly/parse.ts'
import { parseEstimation } from '../src/lib/estimation/parse.ts'
import {
  ESTIMATE_5D_PROMPT,
  ESTIMATE_5D_PROMPT_DESCRIPTION,
  ESTIMATE_5D_PROMPT_NAME,
  ESTIMATE_5D_TOOL_NOTES,
  ESTIMATOR_TOOL_DEFINITIONS,
  EstimatorRuntime,
  runEstimatorTool,
  type EstimatorSyncPayload,
} from '../src/lib/estimator-tools/index.ts'
import type { QuantityResult } from '../src/lib/geometry-qto/types.ts'

// Only the app's own webview ever has a legitimate reason to call this server -
// http://127.0.0.1:43127 is the vite dev server it loads from in `tauri dev`;
// tauri://localhost / http://tauri.localhost are the packaged webview origin
// on different platforms. Anything else gets no Access-Control-Allow-Origin at
// all, so a browser refuses to let the calling page read the response even if
// it somehow had a valid token.
const ALLOWED_ORIGINS = new Set(['http://127.0.0.1:43127', 'tauri://localhost', 'http://tauri.localhost'])

function corsHeaders(req: IncomingMessage): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,Mcp-Session-Id',
    'Cross-Origin-Resource-Policy': 'same-site',
    'Cache-Control': 'no-store',
    Vary: 'Origin',
  }
  const origin = req.headers.origin
  if (origin && ALLOWED_ORIGINS.has(origin)) headers['Access-Control-Allow-Origin'] = origin
  return headers
}

/** Constant-time bearer-token check - every route on this server requires it (see
 * main()'s request handler); a malicious page or unrelated local process cannot
 * mutate the model, execute tools, or use the /llm relay without it. */
function isAuthorized(req: IncomingMessage, token: string): boolean {
  const header = req.headers.authorization
  if (typeof header !== 'string') return false
  const match = /^Bearer\s+(.+)$/i.exec(header)
  if (!match) return false
  const provided = Buffer.from(match[1])
  const expected = Buffer.from(token)
  if (provided.length !== expected.length) return false
  return timingSafeEqual(provided, expected)
}

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  if (index < 0) return undefined
  return process.argv[index + 1]
}

function log(message: string) {
  process.stderr.write(`[ifclite-mcp] ${message}\n`)
}

async function writeCursorMcpConfig(url: string, token: string) {
  const path = resolve('.mcp.json')
  let current: { mcpServers?: Record<string, unknown> } = {}
  try {
    if (existsSync(path)) current = JSON.parse(await readFile(path, 'utf8')) as typeof current
  } catch {
    current = {}
  }
  const next = {
    ...current,
    mcpServers: {
      ...(current.mcpServers ?? {}),
      ifclite: {
        url,
        headers: { Authorization: `Bearer ${token}` },
      },
    },
  }
  await writeFile(path, `${JSON.stringify(next, null, 2)}\n`)
}

function okResult(text: string, structured?: Record<string, unknown>): CallToolResult {
  const content = [{ type: 'text' as const, text }]
  return structured ? { content, structuredContent: structured } : { content }
}

function estimatorTools(runtime: EstimatorRuntime): Tool[] {
  return ESTIMATOR_TOOL_DEFINITIONS.map((def) => ({
    name: def.name,
    description: def.description,
    scope: def.mutate ? 'mutate' : 'read',
    inputSchema: def.parameters as JsonSchema,
    handler: async (input: Record<string, unknown>) => {
      const result = await runEstimatorTool(def.name, input ?? {}, runtime)
      if (!result.ok) {
        return { content: [{ type: 'text' as const, text: result.text }], isError: true }
      }
      return okResult(result.text, result.data)
    },
  }))
}

const estimate5dPrompt: Prompt = {
  name: ESTIMATE_5D_PROMPT_NAME,
  description: ESTIMATE_5D_PROMPT_DESCRIPTION,
  arguments: [
    {
      name: 'focus',
      description: 'Optional focus: selection, a BOQ node id, or a free-text question.',
      required: false,
    },
  ],
  render(args) {
    const focus = args.focus?.trim()
    return {
      description: ESTIMATE_5D_PROMPT_DESCRIPTION,
      messages: [
        { role: 'system', content: { type: 'text', text: ESTIMATE_5D_PROMPT } },
        {
          role: 'user',
          content: {
            type: 'text',
            text: [
              'Use Cost Assembly Store tools (assembly_classify, assembly_search, assembly_get, estimation_*, qto_for_ids, skip_classify).',
              ESTIMATE_5D_TOOL_NOTES,
              'Use property_search, desktop_select, desktop_isolate, and desktop_show_all to find and show elements in the IFCLite desktop viewer. Do not use MCP viewer_* tools for that.',
              'Do not use IFC cost_data / cost_evaluate for this product catalog.',
              'Reply in the Assembly Mapping Summary markdown from the system prompt.',
              focus ? `Focus: ${focus}` : 'Estimate the current selection or open BOQ line.',
            ].join('\n'),
          },
        },
      ],
    }
  },
}

function makeServer(registry: InMemoryModelRegistry, runtime: EstimatorRuntime, sessionId: string): MCPServer {
  const tools = buildDefaultToolRegistry()
  for (const tool of estimatorTools(runtime)) {
    try {
      tools.registerAll([tool])
    } catch (caught) {
      log(`skip tool ${tool.name}: ${caught instanceof Error ? caught.message : String(caught)}`)
    }
  }
  const prompts = buildDefaultPromptRegistry()
  prompts.register(estimate5dPrompt)
  return createMCPServer({
    name: 'ifclite-estimator',
    version: '0.1.0',
    registry,
    sessionId,
    scope: fullScope(),
    tools,
    prompts,
    config: { readOnly: false, samplingEnabled: false, autoOpenViewer: false },
    logger: {
      log(level, message, data) {
        if (level === 'debug') return
        log(`${level} ${message}${data ? ` ${JSON.stringify(data)}` : ''}`)
      },
    },
  })
}

async function loadCatalog(path: string | undefined) {
  if (!path) return null
  const bytes = new Uint8Array(await readFile(path))
  const name = path.split(/[/\\]/).pop() ?? 'Cost Assembly.xml'
  return parseCostAssemblyBytes(bytes, { path, name, modifiedMs: Date.now() })
}

function parseQuantitiesJson(json: string): QuantityResult | null {
  try {
    const parsed = JSON.parse(json) as { result?: QuantityResult; elements?: QuantityResult['elements'] }
    if (parsed?.result?.elements) {
      return {
        ...parsed.result,
        elements: parsed.result.elements.map((element) => ({ ...element, faces: element.faces ?? [] })),
      }
    }
    if (Array.isArray(parsed?.elements)) {
      return parsed as QuantityResult
    }
  } catch {
    /* ignore */
  }
  return null
}

async function readBody(req: IncomingMessage, maxBytes = 64 * 1024 * 1024): Promise<string> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buf.length
    if (size > maxBytes) throw new Error('Request too large')
    chunks.push(buf)
  }
  return Buffer.concat(chunks).toString('utf8')
}

function send(req: IncomingMessage, res: ServerResponse, status: number, body: unknown) {
  const json = JSON.stringify(body)
  res.writeHead(status, { ...corsHeaders(req), 'Content-Type': 'application/json; charset=utf-8' })
  res.end(json)
}

async function chatCompletions(body: {
  provider?: string
  baseUrl?: string
  apiKey?: string
  model?: string
  messages?: unknown
  tools?: unknown
}): Promise<unknown> {
  const provider = body.provider === 'anthropic' ? 'anthropic' : 'openai'
  const apiKey = body.apiKey?.trim()
  if (!apiKey) throw new Error('API key is missing.')
  const model = body.model?.trim() || (provider === 'anthropic' ? 'claude-sonnet-4-5' : 'gpt-4o')
  if (provider === 'anthropic') {
    const base = (body.baseUrl?.trim() || 'https://api.anthropic.com').replace(/\/$/, '')
    const tools = Array.isArray(body.tools)
      ? (body.tools as Array<{ type?: string; function?: { name: string; description?: string; parameters?: unknown } }>).map(
          (tool) => ({
            name: tool.function?.name ?? '',
            description: tool.function?.description ?? '',
            input_schema: tool.function?.parameters ?? { type: 'object', properties: {} },
          }),
        )
      : []
    const rawMessages = Array.isArray(body.messages) ? (body.messages as Array<Record<string, unknown>>) : []
    let system = ''
    const messages: Array<Record<string, unknown>> = []
    for (const message of rawMessages) {
      if (message.role === 'system') {
        system += typeof message.content === 'string' ? message.content : ''
        continue
      }
      if (message.role === 'tool') {
        messages.push({
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: message.tool_call_id,
              content: typeof message.content === 'string' ? message.content : JSON.stringify(message.content),
            },
          ],
        })
        continue
      }
      if (message.role === 'assistant' && Array.isArray(message.tool_calls)) {
        messages.push({
          role: 'assistant',
          content: (message.tool_calls as Array<{ id: string; function: { name: string; arguments: string } }>).map(
            (call) => ({
              type: 'tool_use',
              id: call.id,
              name: call.function.name,
              input: JSON.parse(call.function.arguments || '{}') as unknown,
            }),
          ),
        })
        continue
      }
      messages.push({ role: message.role, content: message.content })
    }
    const response = await fetch(`${base}/v1/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        system: system || undefined,
        messages,
        tools: tools.length ? tools : undefined,
      }),
    })
    const json = (await response.json()) as {
      content?: Array<{ type: string; text?: string; id?: string; name?: string; input?: unknown }>
      error?: { message?: string }
    }
    if (!response.ok) throw new Error(json.error?.message || `Anthropic HTTP ${response.status}`)
    const text = (json.content ?? []).filter((block) => block.type === 'text').map((block) => block.text ?? '').join('\n')
    const toolCalls = (json.content ?? [])
      .filter((block) => block.type === 'tool_use')
      .map((block) => ({
        id: block.id,
        type: 'function',
        function: { name: block.name, arguments: JSON.stringify(block.input ?? {}) },
      }))
    return {
      choices: [
        {
          message: {
            role: 'assistant',
            content: text || null,
            tool_calls: toolCalls.length ? toolCalls : undefined,
          },
        },
      ],
    }
  }
  const base = (body.baseUrl?.trim() || 'https://api.openai.com/v1').replace(/\/$/, '')
  const url = base.endsWith('/chat/completions') ? base : `${base}/chat/completions`
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: body.messages,
      tools: body.tools,
      tool_choice: body.tools ? 'auto' : undefined,
    }),
  })
  const json = await response.json()
  if (!response.ok) {
    const err = json as { error?: { message?: string } }
    throw new Error(err.error?.message || `LLM HTTP ${response.status}`)
  }
  return json
}

async function main() {
  const ifcPath = flag('--ifc')
  const catalogPath = flag('--catalog')
  const sessionPath = flag('--session')
  const quantitiesPath = flag('--quantities')
  const token = flag('--token')
  const host = flag('--host') ?? '127.0.0.1'
  const port = Number(flag('--port') ?? 8765)
  const syncPort = Number(flag('--sync-port') ?? port + 1)
  if (!token) {
    log('refusing to start without --token')
    process.exit(1)
  }

  const runtime = new EstimatorRuntime()
  runtime.ensureQuantities = async (ids) => {
    runtime.requestTakeoff(ids)
    const deadline = Date.now() + 60_000
    while (Date.now() < deadline) {
      const have = new Set(runtime.quantities?.elements.map((element) => element.expressId) ?? [])
      if (ids.every((id) => have.has(id))) return
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
  }
  let ready = false
  let loading = true
  let error: string | null = null
  let bimServer: MCPServer | null = null
  let bimReady = false

  const sync = createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, corsHeaders(req))
      res.end()
      return
    }
    if (!isAuthorized(req, token)) {
      send(req, res, 401, { error: 'unauthorized' })
      return
    }
    const url = new URL(req.url || '/', `http://${host}:${syncPort}`)
    try {
      if (req.method === 'GET' && url.pathname === '/health') {
        send(req, res, 200, {
          ok: true,
          ready,
          loading,
          error,
          mcp: `http://${host}:${port}`,
          revision: runtime.revision,
        })
        return
      }
      if (req.method === 'GET' && url.pathname === '/sync') {
        send(req, res, 200, runtime.snapshot())
        return
      }
      if (req.method === 'POST' && url.pathname === '/sync') {
        const payload = JSON.parse(await readBody(req)) as EstimatorSyncPayload
        if (payload.catalogPath && payload.catalogPath !== runtime.catalogPath) {
          try {
            runtime.setCatalog(await loadCatalog(payload.catalogPath), payload.catalogPath)
          } catch (caught) {
            log(`catalog reload failed: ${caught instanceof Error ? caught.message : String(caught)}`)
          }
        }
        send(req, res, 200, runtime.applyFromApp(payload))
        return
      }
      if (req.method === 'POST' && url.pathname === '/tools') {
        const payload = JSON.parse(await readBody(req)) as { name?: string; arguments?: Record<string, unknown> }
        if (!payload.name) {
          send(req, res, 400, { ok: false, text: 'name is required' })
          return
        }
        const result = await runEstimatorTool(payload.name, payload.arguments ?? {}, runtime)
        send(req, res, result.ok ? 200 : 400, result)
        return
      }
      if (req.method === 'POST' && url.pathname === '/bim') {
        if (!bimServer || !bimReady) {
          send(req, res, 503, { ok: false, text: 'BIM tools are not ready yet.' })
          return
        }
        const payload = JSON.parse(await readBody(req)) as { name?: string; arguments?: Record<string, unknown> }
        if (!payload.name) {
          send(req, res, 400, { ok: false, text: 'name is required' })
          return
        }
        const response = await bimServer.handleMessage({
          jsonrpc: '2.0',
          id: Date.now(),
          method: 'tools/call',
          params: { name: payload.name, arguments: payload.arguments ?? {} },
        })
        send(req, res, 200, response)
        return
      }
      if (req.method === 'POST' && url.pathname === '/llm') {
        const payload = JSON.parse(await readBody(req, 8 * 1024 * 1024)) as Parameters<typeof chatCompletions>[0]
        const result = await chatCompletions(payload)
        send(req, res, 200, result)
        return
      }
      send(req, res, 404, { error: 'not found' })
    } catch (caught) {
      send(req, res, 500, { error: { message: caught instanceof Error ? caught.message : String(caught) } })
    }
  })

  await new Promise<void>((resolveListen, reject) => {
    sync.listen(syncPort, host, () => resolveListen())
    sync.on('error', reject)
  })
  log(`sync http://${host}:${syncPort}`)

  try {
    if (catalogPath && existsSync(catalogPath)) {
      runtime.setCatalog(await loadCatalog(catalogPath), catalogPath)
      log(`catalog ${runtime.catalogSummary?.assemblyCount ?? 0} assemblies`)
    }
    if (sessionPath && existsSync(sessionPath)) {
      try {
        const parsed = JSON.parse(await readFile(sessionPath, 'utf8')) as {
          estimation?: unknown
          quantities?: QuantityResult | null
        }
        if (parsed?.estimation) runtime.estimation = parseEstimation(parsed.estimation)
        if (parsed?.quantities) runtime.quantities = parsed.quantities
      } catch (caught) {
        log(`session parse failed: ${caught instanceof Error ? caught.message : String(caught)}`)
      }
    }
    if (quantitiesPath && existsSync(quantitiesPath)) {
      const parsed = parseQuantitiesJson(await readFile(quantitiesPath, 'utf8'))
      if (parsed) runtime.quantities = parsed
    }

    const registry = new InMemoryModelRegistry()
    if (ifcPath) {
      const model = await loadIfcModel(resolve(ifcPath))
      registry.add(model)
      log(`loaded ${model.name} (${model.id}) — ${model.store.entityCount.toLocaleString()} entities`)
    } else {
      log('started without --ifc; BIM query tools need a model')
    }

    try {
      await writeCursorMcpConfig(`http://${host}:${port}`, token)
      log(`wrote Cursor MCP config ${resolve('.mcp.json')}`)
    } catch (caught) {
      log(`could not write .mcp.json: ${caught instanceof Error ? caught.message : String(caught)}`)
    }

    const transport = new HttpTransport({
      port,
      host,
      authenticator: new BearerTokenAuth(new Map([[token, fullScope()]])),
      sessionFactory: {
        build(_scope, sessionId) {
          return makeServer(registry, runtime, sessionId)
        },
      },
    })
    await transport.listen()
    log(`listening on http://${host}:${port}`)

    bimServer = makeServer(registry, runtime, 'ifclite-app')
    bimServer.attach({ send() {} })
    await bimServer.handleMessage({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-11-05',
        capabilities: {},
        clientInfo: { name: 'ifclite-desktop', version: '0.1.0' },
      },
    })
    await bimServer.handleMessage({ jsonrpc: '2.0', method: 'notifications/initialized' })
    bimReady = true
    ready = true
    loading = false
    process.stdout.write(`MCP_READY http://${host}:${port}\n`)
  } catch (caught) {
    loading = false
    error = caught instanceof Error ? caught.message : String(caught)
    log(`fatal: ${error}`)
    process.exitCode = 1
  }
}

main().catch((err: Error) => {
  process.stderr.write(`[ifclite-mcp] fatal: ${err.message}\n`)
  process.exit(1)
})
