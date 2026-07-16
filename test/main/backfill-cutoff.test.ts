import { describe, it, expect } from 'vitest'
import { backfillCutoff } from '@main/sync/account-syncer'

const NOW = new Date('2026-07-15T12:00:00Z').getTime()
const DAY = 24 * 3600 * 1000

describe('backfillCutoff — Sync-Zeitraum pro Konto', () => {
  it('Standard ohne Einstellung: 90 Tage Liste, 183 Tage Suche', () => {
    expect(backfillCutoff(null, false, NOW)).toBe(NOW - 90 * DAY)
    expect(backfillCutoff(null, true, NOW)).toBe(NOW - 183 * DAY)
    expect(backfillCutoff(undefined, false, NOW)).toBe(NOW - 90 * DAY)
  })

  it('gesetzter Zeitraum gilt für Liste UND Suche', () => {
    expect(backfillCutoff(30, false, NOW)).toBe(NOW - 30 * DAY)
    expect(backfillCutoff(30, true, NOW)).toBe(NOW - 30 * DAY)
    expect(backfillCutoff(365, true, NOW)).toBe(NOW - 365 * DAY)
  })

  it('0 heißt alles synchronisieren (Grenze 0)', () => {
    expect(backfillCutoff(0, false, NOW)).toBe(0)
    expect(backfillCutoff(0, true, NOW)).toBe(0)
  })
})
