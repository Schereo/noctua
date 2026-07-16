import { invoke } from '@renderer/lib/ipc'
import { usePaper } from '@renderer/stores/paper'

/**
 * Persistiert den Composer-Puffer als Entwurf je Thread (M37).
 *
 * Der Composer (`comp` im paper-Store) hält immer nur EINEN Entwurf im
 * Speicher; jeder Threadwechsel oder resetComp() hat ihn bisher verworfen.
 * Dieses Modul lauscht zentral auf den Store: Tippen und Diktat werden
 * entprellt in die drafts-Tabelle geschrieben, und beim Wegwechseln wird der
 * letzte Stand sofort gesichert — egal, welcher Code-Pfad den Reset auslöst.
 */

const DEBOUNCE_MS = 700

let timer: ReturnType<typeof setTimeout> | null = null
let pending: { threadKey: string; text: string; html: string } | null = null
let notifyChanged: (() => void) | null = null

function flush(): void {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  const p = pending
  pending = null
  if (!p) return
  void invoke('drafts:save', p).then(() => notifyChanged?.())
}

function schedule(threadKey: string, text: string, html: string): void {
  pending = { threadKey, text, html }
  if (timer) clearTimeout(timer)
  timer = setTimeout(flush, DEBOUNCE_MS)
}

/**
 * Entfernt den gespeicherten Entwurf eines Threads und verwirft eine noch
 * ausstehende Speicherung, damit sie ihn nicht wiederbelebt (Senden, Verwerfen,
 * Löschen aus der Eulen-Leiste).
 */
export function removeDraft(threadKey: string): void {
  if (pending?.threadKey === threadKey) {
    pending = null
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }
  void invoke('drafts:delete', { threadKey }).then(() => notifyChanged?.())
}

/**
 * Beim App-Start verdrahten; onChanged invalidiert die drafts-Query.
 * Gibt die Abmeldefunktion zurück (StrictMode ruft Effekte doppelt auf).
 */
export function initDraftAutosave(onChanged: () => void): () => void {
  notifyChanged = onChanged
  return usePaper.subscribe((state, prev) => {
    const c = state.comp
    const p = prev.comp
    if (c === p) return

    // Threadwechsel oder Reset: letzten Stand des vorherigen Threads sofort
    // sichern — außer beim Senden, dort löscht der Send-Pfad den Entwurf.
    if (p.threadKey && p.threadKey !== c.threadKey && p.mode !== 'sending') {
      if (p.text.trim()) schedule(p.threadKey, p.text, p.html)
      flush()
    }

    if (!c.threadKey || c.mode === 'sending') return
    if (c.threadKey === p.threadKey && c.text === p.text && c.html === p.html) return

    if (c.text.trim()) {
      schedule(c.threadKey, c.text, c.html)
    } else if (c.threadKey === p.threadKey && p.text.trim()) {
      // Der Text wurde bewusst geleert → gespeicherten Entwurf mit entfernen.
      removeDraft(c.threadKey)
    }
  })
}
