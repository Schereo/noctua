// Reine Zustandslogik der Konten- und Voice-Karten (Design 3b/3e):
// Zweitklick-Bestätigung beim Trennen, Frische-Ableitung der Voice-Card und
// die inline gezeigte Sync-Fehlerzeile. Vom Rendering getrennt, damit
// Zeitfenster und Text-Ableitung testbar sind.

/** Fenster der Zweitklick-Bestätigung: danach fällt der Knopf zurück. */
export const DISCONNECT_CONFIRM_WINDOW_MS = 5000

export type ConfirmEvent = 'arm' | 'esc' | 'blur' | 'timeout' | 'keep' | 'confirm'

/**
 * Übergang der Trennen-Bestätigung: nur 'arm' spannt sie; Esc, Blur, Ablauf
 * des 5-s-Fensters, KEEP und das Bestätigen selbst entspannen sie wieder —
 * unabhängig vom vorherigen Zustand.
 */
export function confirmAfter(event: ConfirmEvent): boolean {
  return event === 'arm'
}

/** Frische-Metadaten eines Stil-Profils (ai.styleMeta.{accountId}). */
export interface VoiceMeta {
  replies: number
  updatedAt: number
}

/** Toleranter Parser — kaputtes JSON oder fehlende Felder ergeben null. */
export function parseVoiceMeta(raw: string | null): VoiceMeta | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { replies?: unknown; updatedAt?: unknown }
    const replies = Number(parsed.replies)
    const updatedAt = Number(parsed.updatedAt)
    if (!Number.isFinite(replies) || replies < 0) return null
    if (!Number.isFinite(updatedAt) || updatedAt <= 0) return null
    return { replies: Math.floor(replies), updatedAt }
  } catch {
    return null
  }
}

export type Freshness = { kind: 'today' } | { kind: 'yesterday' } | { kind: 'days'; days: number }

/**
 * Kalendertag-genaue Frische: „heute" endet um Mitternacht, nicht nach 24 h.
 * Zeitstempel aus der Zukunft (Uhr verstellt) gelten als heute.
 */
export function freshnessOf(updatedAt: number, now: number): Freshness {
  const startOfDay = (ts: number): number => {
    const d = new Date(ts)
    d.setHours(0, 0, 0, 0)
    return d.getTime()
  }
  const dayDiff = Math.round((startOfDay(now) - startOfDay(updatedAt)) / 86_400_000)
  if (dayDiff <= 0) return { kind: 'today' }
  if (dayDiff === 1) return { kind: 'yesterday' }
  return { kind: 'days', days: dayDiff }
}

/**
 * Electron verpackt Handler-Fehler in „Error invoking remote method '…':
 * Error: <echte Meldung>" — inline zählt nur die echte Meldung (Design 3e:
 * „FAILED — the model refused the request", kein Transport-Rauschen).
 */
export function cleanIpcError(message: string): string {
  return message.replace(/^Error invoking remote method '[^']+':\s*(Error:\s*)?/, '')
}

/**
 * Inline-Fehlerzeile eines Kontos: der GESPEICHERTE Fehlertext plus „seit
 * 11:42" — ein Accent-Wort allein ist keine Diagnose (Design 3b). Ohne
 * Fehlertext null, der Aufrufer fällt dann auf das generische Label zurück.
 */
export function syncErrorLine(detail: string | null, since: string | null): string | null {
  const text = detail?.trim()
  if (!text) return null
  return since ? `${text} — ${since}` : text
}
