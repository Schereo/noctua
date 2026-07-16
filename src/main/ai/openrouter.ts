import OpenAI from 'openai'
import { getSecret } from '../auth/secrets'
import { getSetting } from '../db'

let client: OpenAI | null = null
let cachedKey: string | null = null

/** OpenRouter ist OpenAI-kompatibel — ein Client, Modell-IDs aus den Settings. */
export function getOpenRouter(): OpenAI | null {
  const key = getSecret('openrouter.apiKey')
  if (!key) return null
  if (!client || key !== cachedKey) {
    client = new OpenAI({
      apiKey: key,
      baseURL: 'https://openrouter.ai/api/v1',
      defaultHeaders: {
        'HTTP-Referer': 'https://github.com/Schereo/noctua',
        'X-Title': 'Noctua'
      }
    })
    cachedKey = key
  }
  return client
}

/**
 * Zero Data Retention (M86): standardmäßig routet OpenRouter nur zu
 * Anbietern, die Prompts nicht speichern (`data_collection: 'deny'`).
 * Abschaltbar über ai.zdrOnly = '0' — dann stehen mehr Modelle bereit,
 * aber ohne ZDR-Garantie.
 */
export function zdrOnly(): boolean {
  return getSetting('ai.zdrOnly') !== '0'
}

/** OpenRouter-Zusatzfelder für chat.completions.create — bei allen Calls spreaden. */
export function providerBody(): Record<string, unknown> {
  return zdrOnly() ? { provider: { data_collection: 'deny' } } : {}
}

export function getTriageModel(): string {
  return getSetting('ai.triageModel') ?? 'deepseek/deepseek-v4-flash'
}

export function getDraftModel(): string {
  return getSetting('ai.draftModel') ?? 'anthropic/claude-opus-4.8'
}

export function getSttModel(): string {
  // Diktat-Transkription. Hinweis: dediziertes Whisper (openai/whisper-large-v3)
  // listet OpenRouter derzeit nicht — gpt-audio-mini ist der günstigste
  // Audio-Input-Chat; die Auswahl in den Einstellungen speist sich live
  // aus dem Katalog und zeigt Whisper automatisch, sobald es existiert.
  return getSetting('ai.sttModel')?.trim() || 'openai/gpt-audio-mini'
}

interface UsageLike {
  prompt_tokens?: number
  completion_tokens?: number
  cost?: number
}

/** Kosten aus der OpenRouter-Response; Fallback: Preisschätzung fürs Default-Modell. */
export function extractUsage(usage: unknown): {
  inputTokens: number
  outputTokens: number
  costUsd: number
} {
  const u = (usage ?? {}) as UsageLike
  const inputTokens = u.prompt_tokens ?? 0
  const outputTokens = u.completion_tokens ?? 0
  const costUsd =
    typeof u.cost === 'number' && u.cost > 0
      ? u.cost
      : (inputTokens * 0.14 + outputTokens * 0.28) / 1_000_000
  return { inputTokens, outputTokens, costUsd }
}
