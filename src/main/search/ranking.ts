import type { SemanticSearchSignal } from '@shared/types'

export interface RankedSearchList {
  signal: Extract<SemanticSearchSignal, 'fulltext' | 'semantic'>
  messageIds: number[]
  weight?: number
}

export interface FusedSearchCandidate {
  messageId: number
  score: number
  signals: Array<Extract<SemanticSearchSignal, 'fulltext' | 'semantic'>>
  bestRank: number
}

/**
 * Reciprocal Rank Fusion verbindet Ranglisten, ohne BM25- und
 * Vektordistanzen auf eine vermeintlich gemeinsame Skala zu zwingen.
 */
export function reciprocalRankFusion(lists: RankedSearchList[], rrfK = 60): FusedSearchCandidate[] {
  const fused = new Map<number, FusedSearchCandidate>()

  for (const list of lists) {
    const seen = new Set<number>()
    const weight = list.weight ?? 1
    list.messageIds.forEach((messageId, index) => {
      if (seen.has(messageId)) return
      seen.add(messageId)
      const rank = index + 1
      const current = fused.get(messageId) ?? {
        messageId,
        score: 0,
        signals: [],
        bestRank: rank
      }
      current.score += weight / (rrfK + rank)
      current.bestRank = Math.min(current.bestRank, rank)
      if (!current.signals.includes(list.signal)) current.signals.push(list.signal)
      fused.set(messageId, current)
    })
  }

  return [...fused.values()].sort(
    (a, b) => b.score - a.score || a.bestRank - b.bestRank || a.messageId - b.messageId
  )
}

/** Erst nach dem Nachrichten-Ranking wird je Thread der beste Beleg behalten. */
export function dedupeByThread<T extends { threadKey: string }>(rows: T[], limit: number): T[] {
  const seen = new Set<string>()
  const result: T[] = []
  for (const row of rows) {
    if (seen.has(row.threadKey)) continue
    seen.add(row.threadKey)
    result.push(row)
    if (result.length >= limit) break
  }
  return result
}
