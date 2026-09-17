import { useEffect, useMemo, useRef, useState } from 'react'
import { Bot, LoaderCircle, MessageSquarePlus, Send, Settings2, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { EstimatorMarkdown } from '@/components/estimator-markdown'
import { runEstimatorChatTurn, type ChatMessage } from '@/lib/agent/loop'
import { loadAgentSettings, saveAgentSettings, type AgentSettings } from '@/lib/agent/settings'
import {
  ESTIMATE_5D_PROMPT,
  ESTIMATE_5D_TOOL_NOTES,
  EstimatorRuntime,
  type PropertySearchInput,
  type PropertySearchResult,
  type SkipHint,
  type ViewerAction,
} from '@/lib/estimator-tools'
import type { CostAssemblyCatalog } from '@/lib/cost-assembly/types'
import { activeBoq, boqLabel, type EstimationDoc } from '@/lib/estimation'
import type { QuantityResult } from '@/lib/geometry-qto'
import type { PropertyTreeNode } from '@/lib/property-tree'

type EstimatorAgentPanelProps = {
  mcpReady: boolean
  mcpUrl: string | null
  syncPort: number | null
  catalog: CostAssemblyCatalog | null
  catalogPath: string
  estimation: EstimationDoc
  onEstimationChange: (doc: EstimationDoc) => void
  quantities: QuantityResult | null
  selectedIds: number[]
  previewTree: PropertyTreeNode[]
  hints: SkipHint[]
  selectionLabel: string
  ensureQuantities?: (ids: number[]) => Promise<void>
  applyViewer?: (action: ViewerAction) => void | Promise<void>
  searchElements?: (input: PropertySearchInput) => Promise<PropertySearchResult>
}

type ChatThread = {
  id: string
  title: string
  messages: ChatMessage[]
  ended: boolean
}

function newId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function emptyThread(): ChatThread {
  return { id: newId(), title: 'New chat', messages: [], ended: false }
}

function titleFrom(messages: ChatMessage[]) {
  const first = messages.find((message) => message.role === 'user')?.content.trim() ?? ''
  if (!first) return 'New chat'
  return first.length > 36 ? `${first.slice(0, 36)}…` : first
}

export function EstimatorAgentPanel({
  mcpReady,
  mcpUrl,
  syncPort,
  catalog,
  catalogPath,
  estimation,
  onEstimationChange,
  quantities,
  selectedIds,
  previewTree,
  hints,
  selectionLabel,
  ensureQuantities,
  applyViewer,
  searchElements,
}: EstimatorAgentPanelProps) {
  const [settings, setSettings] = useState<AgentSettings>(() => loadAgentSettings())
  const [showSettings, setShowSettings] = useState(false)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [threads, setThreads] = useState<ChatThread[]>(() => [emptyThread()])
  const [activeId, setActiveId] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const turnRef = useRef(0)

  const thread = threads.find((item) => item.id === activeId) ?? threads[0]
  const messages = thread?.messages ?? []
  const ended = thread?.ended ?? false

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [messages, busy, status, activeId])

  const system = useMemo(() => {
    const context = [
      ESTIMATE_5D_PROMPT,
      '',
      '## Live desktop context',
      `Cost Assembly Store: ${catalog ? `${catalog.catalogName} (${catalog.assemblies.length} assemblies) at ${catalogPath}` : 'not loaded'}`,
      `Selection: ${selectionLabel}`,
      `Selected express ids: ${selectedIds.join(', ') || 'none'}`,
      `BOQs: ${estimation.boqs.map((boq) => `${boq.id === estimation.activeId ? '*' : ''}${boqLabel(boq)}`).join(', ') || 'none'}`,
      `Active grouping: ${activeBoq(estimation).groupBy.map((ref) => ref.name).join(' / ') || 'none'}`,
      `Takeoff: ${quantities ? `${quantities.elementCount} elements` : 'not calculated'}`,
      mcpUrl ? `Cursor MCP: ${mcpUrl} (app must be running; paste the status-bar token into .mcp.json)` : 'Cursor MCP: not running',
      ESTIMATE_5D_TOOL_NOTES,
      'Use property_search to find elements (type, name, storey, properties), then desktop_isolate / desktop_select so the user can see them. desktop_show_all restores the model. Use query_entities / geometry_volume / geometry_area for extra BIM queries. Do not call MCP viewer_* tools.',
    ]
    return context.join('\n')
  }, [catalog, catalogPath, estimation, mcpUrl, quantities, selectedIds, selectionLabel])

  const patchThread = (id: string, patch: Partial<ChatThread> | ((current: ChatThread) => ChatThread)) => {
    setThreads((current) =>
      current.map((item) => {
        if (item.id !== id) return item
        return typeof patch === 'function' ? patch(item) : { ...item, ...patch }
      }),
    )
  }

  const onSaveSettings = () => {
    saveAgentSettings(settings)
    setShowSettings(false)
  }

  const onNewChat = () => {
    turnRef.current += 1
    setBusy(false)
    setStatus(null)
    setError(null)
    setDraft('')
    const next = emptyThread()
    setThreads((current) => [...current, next])
    setActiveId(next.id)
  }

  const onEndChat = () => {
    if (!thread || thread.ended) return
    turnRef.current += 1
    setBusy(false)
    setStatus(null)
    setError(null)
    patchThread(thread.id, { ended: true })
  }

  const onSend = async () => {
    const text = draft.trim()
    if (!text || busy || !thread || thread.ended) return
    setDraft('')
    setError(null)
    const user: ChatMessage = { id: newId(), role: 'user', content: text }
    const history = thread.messages
    const chatId = thread.id
    const turn = (turnRef.current += 1)
    patchThread(chatId, (current) => ({
      ...current,
      messages: [...current.messages, user],
      title: current.messages.length === 0 ? titleFrom([user]) : current.title,
    }))
    setBusy(true)
    const runtime = new EstimatorRuntime()
    runtime.setCatalog(catalog, catalogPath)
    runtime.quantities = quantities
    runtime.estimation = estimation
    runtime.selectedIds = selectedIds
    runtime.previewTree = previewTree
    runtime.mergeHints(hints)
    runtime.ensureQuantities = ensureQuantities
    runtime.applyViewer = applyViewer
    runtime.searchElements = searchElements
    try {
      const reply = await runEstimatorChatTurn({
        settings,
        system,
        history,
        user: text,
        runtime,
        syncPort,
        onStatus: (next) => {
          if (turn === turnRef.current) setStatus(next)
        },
      })
      if (turn !== turnRef.current) return
      onEstimationChange(runtime.estimation)
      patchThread(chatId, (current) => ({
        ...current,
        messages: [...current.messages, { id: newId(), role: 'assistant', content: reply }],
      }))
    } catch (caught) {
      if (turn !== turnRef.current) return
      const message = caught instanceof Error ? caught.message : String(caught)
      setError(message)
    } finally {
      if (turn === turnRef.current) {
        setBusy(false)
        setStatus(null)
      }
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-muted/30">
      <div className="flex h-9 shrink-0 items-center gap-1.5 border-b border-border bg-background px-2">
        <Bot className="ml-1 h-4 w-4 shrink-0 text-primary" />
        <select
          className="h-7 min-w-0 flex-1 rounded-md border border-border bg-background px-1.5 text-[11px]"
          value={thread?.id ?? ''}
          onChange={(event) => {
            setActiveId(event.target.value)
            setError(null)
            setShowSettings(false)
          }}
          aria-label="Chat"
        >
          {threads.map((item) => (
            <option key={item.id} value={item.id}>
              {item.ended ? `Ended · ${item.title}` : item.title}
            </option>
          ))}
        </select>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 px-2 text-[11px]"
          onClick={onNewChat}
          title="Start a new chat"
        >
          <MessageSquarePlus className="h-3.5 w-3.5" />
          New
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-[11px]"
          disabled={!thread || thread.ended || (messages.length === 0 && !busy)}
          onClick={onEndChat}
          title="End this chat"
        >
          <Square className="h-3.5 w-3.5" />
          End
        </Button>
        <Button
          type="button"
          size="sm"
          variant={showSettings ? 'secondary' : 'ghost'}
          className="h-7 px-2 text-[11px]"
          onClick={() => setShowSettings((open) => !open)}
        >
          <Settings2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      {showSettings ? (
        <div className="grid shrink-0 gap-2 border-b border-border bg-background p-3 text-xs sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            Provider
            <select
              className="h-8 rounded-md border border-border bg-background px-2"
              value={settings.provider}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  provider: event.target.value === 'anthropic' ? 'anthropic' : 'openai',
                }))
              }
            >
              <option value="openai">OpenAI-compatible</option>
              <option value="anthropic">Anthropic</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            Model
            <input
              className="h-8 rounded-md border border-border bg-background px-2"
              value={settings.model}
              onChange={(event) => setSettings((current) => ({ ...current, model: event.target.value }))}
            />
          </label>
          <label className="flex flex-col gap-1 sm:col-span-2">
            Base URL
            <input
              className="h-8 rounded-md border border-border bg-background px-2 font-mono"
              value={settings.baseUrl}
              onChange={(event) => setSettings((current) => ({ ...current, baseUrl: event.target.value }))}
            />
          </label>
          <label className="flex flex-col gap-1 sm:col-span-2">
            API key
            <input
              type="password"
              className="h-8 rounded-md border border-border bg-background px-2 font-mono"
              value={settings.apiKey}
              onChange={(event) => setSettings((current) => ({ ...current, apiKey: event.target.value }))}
              placeholder="Stored only in this browser / WebView"
            />
          </label>
          <div className="flex items-center justify-between gap-2 sm:col-span-2">
            <span className="text-muted-foreground">
              {mcpReady
                ? `Sidecar live · ${mcpUrl}`
                : 'Sidecar not ready — chat cannot reach the LLM. Open a project and wait for MCP in the status bar.'}
            </span>
            <Button type="button" size="sm" onClick={onSaveSettings}>
              Save
            </Button>
          </div>
        </div>
      ) : null}
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-3 p-3">
          {messages.length === 0 && !busy ? (
            <div className="rounded-xl border border-dashed border-border bg-background/80 px-4 py-5 text-center shadow-sm">
              <p className="text-[13px] font-medium">Estimator chat</p>
              <p className="mt-1 text-[12px] leading-5 text-muted-foreground">
                Ask to isolate a type, take off quantities, attach a Cost Assembly recipe, and fill the BOQ.
                Replies render as an Assembly Mapping Summary.
              </p>
              <p className="mt-2 text-[11px] text-muted-foreground">Selection: {selectionLabel}</p>
            </div>
          ) : null}
          {messages.map((message) =>
            message.role === 'user' ? (
              <div key={message.id} className="flex justify-end">
                <div className="max-w-[92%] rounded-2xl rounded-br-md bg-primary px-3 py-2 text-[13px] leading-5 text-primary-foreground shadow-sm">
                  {message.content}
                </div>
              </div>
            ) : (
              <div key={message.id} className="flex items-start gap-2">
                <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary shadow-sm">
                  <Bot className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0 max-w-[92%] flex-1 rounded-2xl rounded-tl-md border border-border bg-background px-3 py-2.5 shadow-sm">
                  <EstimatorMarkdown text={message.content} />
                </div>
              </div>
            ),
          )}
          {busy ? (
            <div className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-[12px] text-muted-foreground shadow-sm">
              <LoaderCircle className="h-3.5 w-3.5 animate-spin text-primary" />
              {status ?? 'Working…'}
            </div>
          ) : null}
          {error ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
              {error}
            </div>
          ) : null}
          {ended ? (
            <div className="rounded-xl border border-border bg-background px-3 py-2 text-center text-[12px] text-muted-foreground shadow-sm">
              Chat ended.{' '}
              <button type="button" className="font-medium text-primary hover:underline" onClick={onNewChat}>
                Start a new chat
              </button>
            </div>
          ) : null}
          <div ref={endRef} />
        </div>
      </ScrollArea>
      <form
        className="shrink-0 border-t border-border bg-background p-2"
        onSubmit={(event) => {
          event.preventDefault()
          void onSend()
        }}
      >
        <div className="flex items-end gap-2 rounded-xl border border-border bg-muted/40 p-1.5 shadow-inner">
          <textarea
            className="min-h-11 flex-1 resize-none bg-transparent px-2 py-1.5 text-[13px] outline-none disabled:opacity-60"
            placeholder={ended ? 'This chat has ended. Start a new chat to continue.' : 'Find walls, isolate them, map to an assembly…'}
            value={draft}
            disabled={busy || ended}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                void onSend()
              }
            }}
          />
          <Button type="submit" size="sm" className="h-8" disabled={busy || ended || !draft.trim()}>
            <Send className="h-3.5 w-3.5" />
            Send
          </Button>
        </div>
      </form>
    </div>
  )
}
