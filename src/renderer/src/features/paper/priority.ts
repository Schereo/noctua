import type { ThreadListItem } from '@shared/types'

/**
 * Prioritäts-Sichtbarkeit (Design Turn 5): Rang 5 klingelt (Akzent-Tick),
 * Rang 4 benachrichtigt (Ink-Tick), alles darunter bleibt still — die Liste
 * zeigt bewusst keine Zahlen und ändert keine Sortierung.
 */
export function priorityTickTone(aiPriority: number | null): 'accent' | 'ink' | null {
  if (aiPriority === 5) return 'accent'
  if (aiPriority === 4) return 'ink'
  return null
}

/** „Braucht dich"-Filter: Rang 4+ — bewusst dieselbe Schwelle wie priorityTickTone. */
export function needsYou(item: Pick<ThreadListItem, 'aiPriority'>): boolean {
  return (item.aiPriority ?? 0) >= 4
}
