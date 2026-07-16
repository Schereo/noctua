// Reine Schritt- und Zustandslogik des 4-Schritte-Onboardings (Design 1b):
// welcome → connect → key → training. Vom Rendering getrennt, damit
// Enter-Gating, CTA-Freischaltung und Zeilen-Zustände testbar sind.

export type ObStep = 1 | 2 | 3 | 4

/** Anzeige-Zustand einer Trainingszeile in Schritt 4. */
export type TrainRowState = 'idle' | 'running' | 'done' | 'failed' | 'paused'

export interface TrainRowFlags {
  running: boolean
  failed: boolean
  pct: number
}

/**
 * Leitet den Zeilen-Zustand ab. Pausiert (kein Schlüssel) schlägt alles —
 * dann gibt es weder Fortschritt noch Fehler, nur die leere Spur. Danach
 * gilt: gescheitert vor laufend vor fertig; sonst wartet die Zeile noch.
 */
export function rowState(row: TrainRowFlags, paused: boolean): TrainRowState {
  if (paused) return 'paused'
  if (row.failed) return 'failed'
  if (row.running) return 'running'
  if (row.pct >= 100) return 'done'
  return 'idle'
}

/** Schritt-3-CTA (»TRAIN MY VOICE«) erst, wenn ein Schlüssel gespeichert ist oder schon existiert. */
export function trainCtaEnabled(keyReady: boolean): boolean {
  return keyReady
}

/**
 * Schritt-4-CTA (»ENTER YOUR MAIL«): aktiv, sobald keine Zeile mehr läuft
 * oder noch ansteht. Pausierte und gescheiterte Zeilen blockieren den
 * Einstieg bewusst nicht — Mail funktioniert auch ohne Eule.
 */
export function finishCtaEnabled(states: TrainRowState[]): boolean {
  return states.every((s) => s === 'done' || s === 'failed' || s === 'paused')
}

/**
 * Boot-Entscheidung beim App-Start: Was passiert mit dem Onboarding?
 * - `none`: schon abgeschlossen.
 * - `resume`: Onboarding lief bereits (Started-Flag) und wurde durch Neustart/
 *   Reload unterbrochen — fortsetzen, auch wenn schon Konten verbunden sind.
 *   Vorher schluckte die Bestandskonten-Heuristik diesen Fall: Wer mitten im
 *   Flow neu startete, wurde nie nach dem OpenRouter-Schlüssel gefragt.
 * - `legacyMarkOnboarded`: Konten existieren, aber das Onboarding lief nie —
 *   Bestandsinstallation von vor dem Onboarding, still als erledigt markieren.
 * - `show`: echter Erststart.
 */
export type OnboardingBootDecision = 'none' | 'show' | 'resume' | 'legacyMarkOnboarded'

export function onboardingBootDecision(ctx: {
  onboarded: boolean
  started: boolean
  accountCount: number
}): OnboardingBootDecision {
  if (ctx.onboarded) return 'none'
  if (ctx.started) return 'resume'
  if (ctx.accountCount > 0) return 'legacyMarkOnboarded'
  return 'show'
}

/** Was Enter außerhalb eines Inputs auf dem aktuellen Schritt bewirkt. */
export type EnterAction =
  | { kind: 'to-connect' }
  | { kind: 'toast-connect-one' }
  | { kind: 'to-key' }
  | { kind: 'to-training' }
  | { kind: 'finish' }
  | null

export function enterAction(
  step: ObStep,
  ctx: { connectedCount: number; keyReady: boolean; rowStates: TrainRowState[] }
): EnterAction {
  if (step === 1) return { kind: 'to-connect' }
  if (step === 2) return ctx.connectedCount > 0 ? { kind: 'to-key' } : { kind: 'toast-connect-one' }
  // Schritt 3: Enter startet das Training nur mit Schlüssel — Überspringen
  // bleibt ein bewusster Klick auf den Skip-Link, nie ein versehentliches Enter.
  if (step === 3) return ctx.keyReady ? { kind: 'to-training' } : null
  return finishCtaEnabled(ctx.rowStates) ? { kind: 'finish' } : null
}
