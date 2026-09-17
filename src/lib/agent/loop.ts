import {
  BIM_PROXY_TOOL_DEFINITIONS,
  ESTIMATOR_TOOL_DEFINITIONS,
  runEstimatorTool,
  type EstimatorRuntime,
  type ToolResult,
} from '@/lib/estimator-tools'
import { callSidecarBim, callSidecarLlm } from '@/lib/mcp/host'
import type { AgentSettings } from '@/lib/agent/settings'

export type ChatRole = 'user' | 'assistant' | 'system'

export type ChatMessage = {
  id: string
  role: ChatRole
  content: string
}

type OpenAiMessage = {
  role: string
  content?: string | null
  tool_call_id?: string
  tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>
}

function openaiTools() {
  return [...ESTIMATOR_TOOL_DEFINITIONS, ...BIM_PROXY_TOOL_DEFINITIONS].map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }))
}

function isEstimatorTool(name: string): boolean {
  return ESTIMATOR_TOOL_DEFINITIONS.some((tool) => tool.name === name)
}

async function dispatchTool(
  name: string,
  rawArgs: string,
  runtime: EstimatorRuntime,
  syncPort: number | null,
  mcpToken: string | null,
): Promise<string> {
  let args: Record<string, unknown> = {}
  try {
    args = rawArgs ? (JSON.parse(rawArgs) as Record<string, unknown>) : {}
  } catch {
    return `Invalid JSON arguments for ${name}`
  }
  if (isEstimatorTool(name)) {
    const result: ToolResult = await runEstimatorTool(name, args, runtime)
    return result.data ? `${result.text}\n${JSON.stringify(result.data, null, 2)}` : result.text
  }
  if (!syncPort || !mcpToken) return `${name} needs the MCP sidecar (BIM tools).`
  return callSidecarBim(syncPort, mcpToken, name, args)
}

export async function runEstimatorChatTurn(args: {
  settings: AgentSettings
  system: string
  history: ChatMessage[]
  user: string
  runtime: EstimatorRuntime
  syncPort: number | null
  mcpToken: string | null
  onStatus?: (text: string) => void
}): Promise<string> {
  if (!args.settings.apiKey.trim()) {
    throw new Error('Add an API key in Estimator settings.')
  }
  if (args.syncPort == null || !args.mcpToken) {
    throw new Error(
      'The Estimator sidecar is not running, so chat cannot call the LLM. Open a project and wait until the status bar says MCP ready. The agent can take off quantities, classify assemblies, and build a BOQ once that is live.',
    )
  }
  const messages: OpenAiMessage[] = [
    { role: 'system', content: args.system },
    ...args.history
      .filter((message) => message.role !== 'system')
      .map((message) => ({ role: message.role, content: message.content })),
    { role: 'user', content: args.user },
  ]
  const tools = openaiTools()
  for (let round = 0; round < 8; round += 1) {
    args.onStatus?.(round === 0 ? 'Thinking…' : `Tool round ${round}…`)
    const json = await callSidecarLlm(args.syncPort, args.mcpToken, {
      provider: args.settings.provider,
      baseUrl: args.settings.baseUrl,
      apiKey: args.settings.apiKey,
      model: args.settings.model,
      messages,
      tools,
    })
    if (json.error?.message) throw new Error(json.error.message)
    const message = json.choices?.[0]?.message
    if (!message) throw new Error('The model returned an empty response.')
    const calls = message.tool_calls ?? []
    if (calls.length === 0) {
      return (message.content ?? '').trim() || 'Done.'
    }
    messages.push({
      role: 'assistant',
      content: message.content ?? null,
      tool_calls: calls,
    })
    for (const call of calls) {
      args.onStatus?.(`Calling ${call.function.name}…`)
      const output = await dispatchTool(
        call.function.name,
        call.function.arguments,
        args.runtime,
        args.syncPort,
        args.mcpToken,
      )
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: output,
      })
    }
  }
  throw new Error('Stopped after 8 tool rounds. Ask again with a smaller selection.')
}
