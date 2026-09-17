const STORAGE_KEY = 'ifclite.estimator-agent'

export type AgentProvider = 'openai' | 'anthropic'

export type AgentSettings = {
  provider: AgentProvider
  baseUrl: string
  apiKey: string
  model: string
}

export const DEFAULT_AGENT_SETTINGS: AgentSettings = {
  provider: 'openai',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o',
}

export function parseAgentSettings(raw: string | null): AgentSettings {
  if (!raw) return { ...DEFAULT_AGENT_SETTINGS }
  try {
    const parsed = JSON.parse(raw) as Partial<AgentSettings>
    return {
      provider: parsed.provider === 'anthropic' ? 'anthropic' : 'openai',
      baseUrl: typeof parsed.baseUrl === 'string' ? parsed.baseUrl : DEFAULT_AGENT_SETTINGS.baseUrl,
      apiKey: typeof parsed.apiKey === 'string' ? parsed.apiKey : '',
      model: typeof parsed.model === 'string' && parsed.model.trim() ? parsed.model : DEFAULT_AGENT_SETTINGS.model,
    }
  } catch {
    return { ...DEFAULT_AGENT_SETTINGS }
  }
}

export function loadAgentSettings(): AgentSettings {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_AGENT_SETTINGS }
  return parseAgentSettings(localStorage.getItem(STORAGE_KEY))
}

export function saveAgentSettings(settings: AgentSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
}
