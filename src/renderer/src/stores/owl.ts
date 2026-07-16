import { create } from 'zustand'
import type { OwlMessage, OwlSource } from '@shared/types'
import type { PushPayload } from '@shared/ipc-contract'
import type { SemanticSearchHit } from '@renderer/features/search/useSemanticSearch'

// Zustand der Owl-View (Suchen + Fragen in einem Eingabefeld).
// Der Automat aus dem Design-Handoff:
//   empty → typing(hits) → asking(streaming) → conversation(idle) → typing(follow-up)
// Die IPC-Aufrufe (ai:chat, owl:*) leben in der View bzw. in queries/owl.ts —
// hier nur reine, testbare Übergänge.

/** Nachricht im aktiven Verlauf; pending markiert die noch streamende Antwort. */
export interface OwlDraftMessage extends OwlMessage {
  pending?: boolean
}

export type OwlPhase = 'empty' | 'typing' | 'asking' | 'conversation'

interface OwlState {
  /** Entwurfstext im Eingabefeld (Suche und Frage zugleich). */
  query: string
  setQuery: (query: string) => void
  /** Geöffnetes (persistiertes) Gespräch — null vor der ersten Speicherung. */
  selConversationId: number | null
  /** Aktiver Verlauf im Blatt. */
  messages: OwlDraftMessage[]
  /** Läuft gerade eine Antwort? */
  asking: boolean
  chatId: string | null
  /** Inline-Fehler unterm Eingabefeld — nie als Toast. */
  askError: string | null
  /** Live-Treffer zum Frage-Zeitpunkt: reichern die SOURCES-Karte an. */
  contextHits: SemanticSearchHit[]
  /** Zähler: Eingabefeld fokussieren, sobald die View (wieder) steht. */
  pendingFocus: boolean
  requestFocus: () => void
  clearFocusRequest: () => void
  /**
   * Frage stellen: hängt Nutzerbeitrag + streamende Antwort an und liefert
   * die history für ai:chat (Verlauf VOR dieser Frage). null, wenn gerade
   * schon gefragt wird oder die Frage leer ist.
   */
  beginAsk: (
    question: string,
    hits?: SemanticSearchHit[]
  ) => { history: Array<{ role: 'user' | 'assistant'; content: string }> } | null
  setChatId: (chatId: string) => void
  /** Streaming-Chunk anwenden; fremde chatIds werden ignoriert. */
  applyChunk: (payload: PushPayload<'ai:chatChunk'>) => void
  /** Abbruch/Fehler: Frage zurück ins Eingabefeld, nichts wird gespeichert. */
  failAsk: (message: string) => void
  /** Nach owl:save: id des persistierten Gesprächs übernehmen. */
  setSaved: (id: number) => void
  /** Persistiertes Gespräch ins Blatt laden. */
  openConversation: (conversation: { id: number; messages: OwlMessage[] }) => void
  /** n / NEUE FRAGE: zurück in den Leerzustand. */
  newQuestion: () => void
}

/** Ableitung der Automat-Phase — die View rendert ausschließlich danach. */
export function owlPhase(state: {
  query: string
  asking: boolean
  messages: OwlDraftMessage[]
}): OwlPhase {
  if (state.asking) return 'asking'
  if (state.query.trim()) return 'typing'
  return state.messages.length > 0 ? 'conversation' : 'empty'
}

/** history für ai:chat: abgeschlossene Beiträge, gekappt aufs Contract-Limit. */
export function historyForAsk(
  messages: OwlDraftMessage[]
): Array<{ role: 'user' | 'assistant'; content: string }> {
  return messages
    .filter((m) => !m.pending && m.content.trim())
    .map((m) => ({ role: m.role, content: m.content.slice(0, 6000) }))
    .slice(-12)
}

/** Quellen aus dem Push mit den Live-Treffern zum Frage-Zeitpunkt anreichern. */
export function enrichSources(
  sources: NonNullable<PushPayload<'ai:chatChunk'>['sources']>,
  hits: SemanticSearchHit[]
): OwlSource[] {
  return sources.map((source) => {
    const hit = hits.find((h) => h.threadKey === source.threadKey)
    return hit
      ? {
          ...source,
          subject: source.subject ?? hit.subject,
          accountName: hit.accountName,
          mailbox: hit.mailbox,
          date: hit.date
        }
      : source
  })
}

export const useOwl = create<OwlState>((set, get) => ({
  query: '',
  setQuery: (query) => set({ query, askError: null }),
  selConversationId: null,
  messages: [],
  asking: false,
  chatId: null,
  askError: null,
  contextHits: [],
  pendingFocus: false,
  requestFocus: () => set({ pendingFocus: true }),
  clearFocusRequest: () => set({ pendingFocus: false }),

  beginAsk: (question, hits = []) => {
    const state = get()
    const q = question.trim()
    if (!q || state.asking) return null
    const history = historyForAsk(state.messages)
    set({
      messages: [
        ...state.messages,
        { role: 'user', content: q, at: Date.now() },
        { role: 'assistant', content: '', at: Date.now(), pending: true }
      ],
      query: '',
      asking: true,
      chatId: null,
      askError: null,
      contextHits: hits
    })
    return { history }
  },

  setChatId: (chatId) => set({ chatId }),

  applyChunk: (payload) => {
    const state = get()
    if (!state.chatId || payload.chatId !== state.chatId) return
    if (payload.error) {
      get().failAsk(payload.error)
      return
    }
    const messages = [...state.messages]
    const last = messages[messages.length - 1]
    if (!last || last.role !== 'assistant' || !last.pending) return
    messages[messages.length - 1] = {
      ...last,
      content: last.content + payload.chunk,
      sources: payload.sources ? enrichSources(payload.sources, state.contextHits) : last.sources,
      pending: !payload.done
    }
    set({ messages, ...(payload.done ? { asking: false, chatId: null } : {}) })
  },

  failAsk: (message) => {
    // Abgebrochene Fragen verschwinden restlos: Frage zurück ins Feld,
    // Verlauf wie vor dem Fragen — gespeichert wird so etwas nie.
    const state = get()
    const messages = [...state.messages]
    const pendingIndex = messages.findLastIndex((m) => m.role === 'assistant' && m.pending)
    let question = ''
    if (pendingIndex !== -1) {
      messages.splice(pendingIndex, 1)
      const userIndex = pendingIndex - 1
      if (messages[userIndex]?.role === 'user') {
        question = messages[userIndex].content
        messages.splice(userIndex, 1)
      }
    }
    set({
      messages,
      asking: false,
      chatId: null,
      askError: message,
      query: state.query || question
    })
  },

  setSaved: (id) => set({ selConversationId: id }),

  openConversation: ({ id, messages }) =>
    set({
      selConversationId: id,
      messages,
      query: '',
      asking: false,
      chatId: null,
      askError: null,
      contextHits: []
    }),

  newQuestion: () =>
    set({
      selConversationId: null,
      messages: [],
      query: '',
      asking: false,
      chatId: null,
      askError: null,
      contextHits: []
    })
}))
