import { create } from 'zustand'

// Zustand des Stups-Composers der Wartet-Ansicht: derselbe Automat wie der
// Reply-Composer (stores/paper, comp), nur an ein Followup (messageId) statt
// an einen Thread gebunden. Eigener Store, damit ein laufendes Stups-Diktat
// den Posteingangs-Entwurf nicht berührt — und umgekehrt.

export type NudgeMode = 'idle' | 'listening' | 'transcribing' | 'drafting' | 'ready' | 'sending'
export type NudgeResultKind = 'transcribed' | 'generated'
export type NudgeErrorKind = 'transcription' | 'generation' | 'send'

export interface NudgeCompState {
  /** Followup (messages.id der eigenen gesendeten Mail), zu dem der Puffer gehört. */
  messageId: number | null
  mode: NudgeMode
  secs: number
  processingSeconds: number
  text: string
  html: string
  originalText: string
  originalHtml: string
  resultKind: NudgeResultKind | null
  error: string | null
  errorKind: NudgeErrorKind | null
  draftId: string | null
  generationStarted: boolean
}

const NUDGE_IDLE: NudgeCompState = {
  messageId: null,
  mode: 'idle',
  secs: 0,
  processingSeconds: 0,
  text: '',
  html: '',
  originalText: '',
  originalHtml: '',
  resultKind: null,
  error: null,
  errorKind: null,
  draftId: null,
  generationStarted: false
}

interface NudgeStore extends NudgeCompState {
  setNudge: (patch: Partial<NudgeCompState>) => void
  resetNudge: (messageId?: number | null) => void
}

export const useNudge = create<NudgeStore>((set) => ({
  ...NUDGE_IDLE,
  setNudge: (patch) => set(patch),
  resetNudge: (messageId = null) => set({ ...NUDGE_IDLE, messageId })
}))
