/**
 * Konto-Automatik des Composers (Design 3a): Neue Nachrichten folgen still dem
 * zuletzt für den ersten Empfänger verwendeten Postfach. Wechselt die
 * Automatik das sichtbare VON-Konto, erscheint für ~4 s eine Akzent-Notiz —
 * eine manuelle Wahl gewinnt und unterdrückt sie.
 */

/** Sichtbarkeitsdauer der Autopilot-Notiz (~4 s laut Design 3a). */
export const FROM_AUTOPILOT_NOTE_MS = 4000

export interface AutoSwitchPlan {
  accountId: number
  /** Notiz nur zeigen, wenn sich das sichtbar gewählte Konto wirklich ändert. */
  showNote: boolean
}

export function planAutoSwitch(params: {
  /** Bevorzugtes Konto laut contacts:preferredAccount — null: keine Historie. */
  preferredAccountId: number | null
  /** Effektiv angezeigtes Konto (gewähltes oder erstes) — null: keine Konten. */
  currentAccountId: number | null
  /** Hat Tim in diesem Entwurf schon selbst gewählt? Dann gewinnt er. */
  manuallySelected: boolean
  /** Bekannte Konto-IDs — verwaiste Empfehlungen werden ignoriert. */
  accountIds: readonly number[]
}): AutoSwitchPlan | null {
  const { preferredAccountId, currentAccountId, manuallySelected, accountIds } = params
  if (manuallySelected || preferredAccountId === null) return null
  if (!accountIds.includes(preferredAccountId)) return null
  return {
    accountId: preferredAccountId,
    showNote: preferredAccountId !== currentAccountId
  }
}
