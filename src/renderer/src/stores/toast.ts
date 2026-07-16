import { create } from 'zustand'

// Eine Toast-Warteschlange für alles (Design 1c): genau eine sichtbare Toast,
// Priorität countdown > error > action > info. Die reine Queue-Logik
// (pushToast/advanceQueue/dismissToast/…) rechnet mit einer hereingereichten
// Uhr und ist damit ohne Timer unit-testbar; der Zustand-Store darunter
// kümmert sich nur um Date.now() und die Timeouts.

export type ToastKind = 'info' | 'action' | 'countdown' | 'error'

export interface ToastAction {
  label: string
  /** Tasten-Chip im Knopf (z. B. „Z", „⌘Z") — die Taste wirkt identisch. */
  kbd?: string
  run: () => void
}

export interface Toast {
  id: number
  kind: ToastKind
  text: string
  action?: ToastAction
  /** Text stammt von der Eule (Modell) — die Leiste zeigt Augen statt Quadrat. */
  owl?: boolean
  /** SCHLIESSEN-Knopf zeigen; die Toast lebt dann bis zum Klick. */
  dismiss?: boolean
  createdAt: number
  /** Anzeigedauer für Infos; wird beim Zeigen in expiresAt übersetzt. */
  durationMs?: number
  /** Absoluter Ablauf: bei action das Ende des Angebots, bei info das Anzeige-Ende. */
  expiresAt?: number
  countdown?: {
    /** Bis hierhin läuft das Rückgängig-Fenster (= sendAt). */
    until: number
    /** Live-Text mit Restsekunden (übersetzt zur Renderzeit). */
    textFor: (secondsLeft: number) => string
    /** Info-Text nach Ablauf des Countdowns (Auto-Swap, gleiche id). */
    doneText: string
  }
}

/** Anzeigedauer einer Info-Toast (das alte PaperToast-Timing). */
export const INFO_TOAST_MS = 3600
/** Verdrängte Infos kommen nur zurück, solange sie jünger als 8 s sind. */
export const RESHOW_FRESH_MS = 8000

const PRIORITY: Record<ToastKind, number> = { countdown: 3, error: 2, action: 1, info: 0 }

export interface ToastQueueState {
  current: Toast | null
  queue: Toast[]
}

/** Darf eine wartende Toast (noch) gezeigt werden? */
export function toastAlive(toast: Toast, now: number): boolean {
  if (toast.kind === 'error' || toast.dismiss) return true
  if (toast.kind === 'countdown') return true
  // action lebt exakt so lange wie ihr Angebot (absolutes Fenster)
  if (toast.kind === 'action') return toast.expiresAt === undefined || now < toast.expiresAt
  return now - toast.createdAt < RESHOW_FRESH_MS
}

/** Countdown → sein Done-Info-Text: gleiche id, Aktion erlischt mit dem Fenster. */
export function swapToDone(toast: Toast, now: number): Toast {
  return {
    id: toast.id,
    kind: 'info',
    text: toast.countdown?.doneText ?? toast.text,
    createdAt: now,
    expiresAt: now + INFO_TOAST_MS
  }
}

/** Beim Anzeigen konkretisieren: Infos bekommen ihr Ablaufdatum (frisch, auch
 *  nach Verdrängung), ein bereits abgelaufener Countdown seinen Done-Text. */
function materialize(toast: Toast, now: number): Toast {
  if (toast.countdown && now >= toast.countdown.until) return swapToDone(toast, now)
  if (toast.kind === 'info' && !toast.dismiss) {
    return { ...toast, expiresAt: now + (toast.durationMs ?? INFO_TOAST_MS) }
  }
  return toast
}

/** Neue Toast: gleich- oder höherrangig verdrängt, sonst hinten anstellen. */
export function pushToast(state: ToastQueueState, toast: Toast, now: number): ToastQueueState {
  const cur = state.current
  if (!cur) return { current: materialize(toast, now), queue: state.queue }
  if (PRIORITY[toast.kind] >= PRIORITY[cur.kind]) {
    // Die Verdrängte wartet vorn und darf wiederkommen, solange sie lebt
    return { current: materialize(toast, now), queue: [cur, ...state.queue] }
  }
  return { current: cur, queue: [...state.queue, toast] }
}

/** Sichtbare Toast räumen und die beste noch lebende Wartende zeigen. */
export function advanceQueue(state: ToastQueueState, now: number): ToastQueueState {
  const candidates = state.queue.filter((t) => toastAlive(t, now))
  if (candidates.length === 0) return { current: null, queue: [] }
  let best = candidates[0]
  for (const t of candidates) if (PRIORITY[t.kind] > PRIORITY[best.kind]) best = t
  return { current: materialize(best, now), queue: candidates.filter((t) => t !== best) }
}

/** Gezielt entfernen — sichtbar oder wartend (z. B. Countdown nach Cancel). */
export function dismissToast(state: ToastQueueState, id: number, now: number): ToastQueueState {
  if (state.current?.id === id) return advanceQueue(state, now)
  return { current: state.current, queue: state.queue.filter((t) => t.id !== id) }
}

interface ToastStore extends ToastQueueState {
  push: (toast: Omit<Toast, 'id' | 'createdAt'>) => number
  dismiss: (id: number) => void
  /** Aktions-Knopf (oder seine Taste) ausführen; die Toast erlischt dabei. */
  runAction: (id: number) => void
  /** Countdown-Ende der sichtbaren Toast: auf den Done-Text wechseln. */
  swapDone: () => void
  /** Sichtbare Toast abräumen und die nächste zeigen (Timer-Pfad). */
  advance: () => void
}

let nextId = 1
let timer: ReturnType<typeof setTimeout> | null = null

/** Timer auf den nächsten Stichtag der sichtbaren Toast stellen. */
function schedule(): void {
  if (timer) clearTimeout(timer)
  timer = null
  const cur = useToast.getState().current
  if (!cur) return
  const deadline = cur.countdown ? cur.countdown.until : cur.expiresAt
  if (deadline === undefined) return
  const id = cur.id
  const wasCountdown = Boolean(cur.countdown)
  timer = setTimeout(
    () => {
      const state = useToast.getState()
      if (state.current?.id !== id) return
      if (wasCountdown && state.current.countdown) state.swapDone()
      else state.advance()
    },
    Math.max(0, deadline - Date.now())
  )
}

export const useToast = create<ToastStore>((set, get) => ({
  current: null,
  queue: [],
  push: (partial) => {
    const now = Date.now()
    const entry: Toast = { ...partial, id: nextId++, createdAt: now }
    set((s) => pushToast(s, entry, now))
    schedule()
    return entry.id
  },
  dismiss: (id) => {
    set((s) => dismissToast(s, id, Date.now()))
    schedule()
  },
  runAction: (id) => {
    const s = get()
    const target = s.current?.id === id ? s.current : s.queue.find((t) => t.id === id)
    if (!target?.action) return
    get().dismiss(id)
    target.action.run()
  },
  swapDone: () => {
    set((s) => (s.current ? { current: swapToDone(s.current, Date.now()) } : {}))
    schedule()
  },
  advance: () => {
    set((s) => advanceQueue(s, Date.now()))
    schedule()
  }
}))

// Öffentliche API (C1): toast.info / toast.action / toast.countdown / toast.error
export const toast = {
  info(
    text: string,
    opts: { action?: ToastAction; dismiss?: boolean; durationMs?: number; owl?: boolean } = {}
  ): number {
    return useToast.getState().push({ kind: 'info', text, ...opts })
  },
  /** Lebt exakt so lange wie ihr Angebot (windowMs ab jetzt, absolut). */
  action(
    text: string,
    action: ToastAction,
    windowMs: number,
    opts: { owl?: boolean } = {}
  ): number {
    return useToast
      .getState()
      .push({ kind: 'action', text, action, expiresAt: Date.now() + windowMs, ...opts })
  },
  countdown(opts: {
    until: number
    textFor: (secondsLeft: number) => string
    doneText: string
    action: ToastAction
  }): number {
    const secondsLeft = Math.max(0, Math.ceil((opts.until - Date.now()) / 1000))
    return useToast.getState().push({
      kind: 'countdown',
      text: opts.textFor(secondsLeft),
      action: opts.action,
      countdown: { until: opts.until, textFor: opts.textFor, doneText: opts.doneText }
    })
  },
  /** Bleibt bis zum Schließen stehen. */
  error(text: string, opts: { action?: ToastAction } = {}): number {
    return useToast.getState().push({ kind: 'error', text, action: opts.action, dismiss: true })
  },
  dismiss(id: number): void {
    useToast.getState().dismiss(id)
  }
}
