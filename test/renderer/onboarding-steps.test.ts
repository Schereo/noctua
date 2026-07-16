import { describe, expect, it } from 'vitest'
import {
  enterAction,
  finishCtaEnabled,
  onboardingBootDecision,
  rowState,
  trainCtaEnabled,
  type TrainRowFlags,
  type TrainRowState
} from '@renderer/features/paper/onboarding-steps'

describe('onboardingBootDecision', () => {
  it('abgeschlossenes Onboarding gewinnt immer', () => {
    expect(onboardingBootDecision({ onboarded: true, started: true, accountCount: 3 })).toBe('none')
    expect(onboardingBootDecision({ onboarded: true, started: false, accountCount: 0 })).toBe(
      'none'
    )
  })

  it('echter Erststart zeigt das Onboarding', () => {
    expect(onboardingBootDecision({ onboarded: false, started: false, accountCount: 0 })).toBe(
      'show'
    )
  })

  it('Neustart mitten im Flow setzt fort — auch mit schon verbundenem Konto', () => {
    expect(onboardingBootDecision({ onboarded: false, started: true, accountCount: 1 })).toBe(
      'resume'
    )
    expect(onboardingBootDecision({ onboarded: false, started: true, accountCount: 0 })).toBe(
      'resume'
    )
  })

  it('Bestandskonten ohne je gestarteten Flow werden still als onboarded markiert', () => {
    expect(onboardingBootDecision({ onboarded: false, started: false, accountCount: 2 })).toBe(
      'legacyMarkOnboarded'
    )
  })
})

function row(overrides: Partial<TrainRowFlags> = {}): TrainRowFlags {
  return { running: false, failed: false, pct: 0, ...overrides }
}

describe('rowState', () => {
  it('pausiert schlaegt alles — auch Fehler und Fortschritt', () => {
    expect(rowState(row(), true)).toBe('paused')
    expect(rowState(row({ failed: true }), true)).toBe('paused')
    expect(rowState(row({ running: true, pct: 48 }), true)).toBe('paused')
    expect(rowState(row({ pct: 100 }), true)).toBe('paused')
  })

  it('gescheitert gewinnt vor laufend und fertig', () => {
    expect(rowState(row({ failed: true }), false)).toBe('failed')
    expect(rowState(row({ failed: true, pct: 100 }), false)).toBe('failed')
  })

  it('laufend, solange das Intervall tickt', () => {
    expect(rowState(row({ running: true, pct: 0 }), false)).toBe('running')
    expect(rowState(row({ running: true, pct: 92 }), false)).toBe('running')
  })

  it('fertig erst ab 100 Prozent, davor wartet die Zeile', () => {
    expect(rowState(row({ pct: 100 }), false)).toBe('done')
    expect(rowState(row({ pct: 99 }), false)).toBe('idle')
    expect(rowState(row(), false)).toBe('idle')
  })
})

describe('trainCtaEnabled', () => {
  it('TRAIN MY VOICE nur mit gespeichertem oder vorhandenem Schluessel', () => {
    expect(trainCtaEnabled(false)).toBe(false)
    expect(trainCtaEnabled(true)).toBe(true)
  })
})

describe('finishCtaEnabled', () => {
  it('aktiv, wenn alle Zeilen fertig sind', () => {
    expect(finishCtaEnabled(['done', 'done'])).toBe(true)
  })

  it('aktiv im Pausen-Modus — Mail funktioniert auch ohne Eule', () => {
    expect(finishCtaEnabled(['paused', 'paused'])).toBe(true)
  })

  it('gescheiterte Zeilen blockieren den Einstieg nicht', () => {
    expect(finishCtaEnabled(['done', 'failed'])).toBe(true)
  })

  it('blockiert, solange eine Zeile laeuft oder noch ansteht', () => {
    expect(finishCtaEnabled(['done', 'running'])).toBe(false)
    expect(finishCtaEnabled(['idle', 'done'])).toBe(false)
  })

  it('ohne Zeilen trivially aktiv (kommt nach Schritt 2 nicht vor)', () => {
    expect(finishCtaEnabled([])).toBe(true)
  })
})

describe('enterAction', () => {
  interface Ctx {
    connectedCount: number
    keyReady: boolean
    rowStates: TrainRowState[]
  }
  const ctx = (overrides: Partial<Ctx> = {}): Ctx => ({
    connectedCount: 1,
    keyReady: false,
    rowStates: [],
    ...overrides
  })

  it('Schritt 1: Enter geht immer zu connect', () => {
    expect(enterAction(1, ctx({ connectedCount: 0 }))).toEqual({ kind: 'to-connect' })
  })

  it('Schritt 2: ohne Konto Toast, mit Konto weiter zum Schluessel', () => {
    expect(enterAction(2, ctx({ connectedCount: 0 }))).toEqual({ kind: 'toast-connect-one' })
    expect(enterAction(2, ctx({ connectedCount: 2 }))).toEqual({ kind: 'to-key' })
  })

  it('Schritt 3: Enter startet Training nur mit Schluessel — nie Skip per Enter', () => {
    expect(enterAction(3, ctx({ keyReady: false }))).toBeNull()
    expect(enterAction(3, ctx({ keyReady: true }))).toEqual({ kind: 'to-training' })
  })

  it('Schritt 4: Enter beendet nur, wenn nichts mehr laeuft', () => {
    expect(enterAction(4, ctx({ rowStates: ['running', 'done'] }))).toBeNull()
    expect(enterAction(4, ctx({ rowStates: ['idle'] }))).toBeNull()
    expect(enterAction(4, ctx({ rowStates: ['done', 'done'] }))).toEqual({ kind: 'finish' })
  })

  it('Schritt 4 pausiert: Enter beendet sofort', () => {
    expect(enterAction(4, ctx({ rowStates: ['paused', 'paused'] }))).toEqual({ kind: 'finish' })
  })

  it('Schritt 4 mit gescheiterten Zeilen: Einstieg bleibt moeglich', () => {
    expect(enterAction(4, ctx({ rowStates: ['failed', 'done'] }))).toEqual({ kind: 'finish' })
  })
})
