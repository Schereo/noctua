import { loadModule, type Hunspell } from 'hunspell-asm'

export interface DictBuffers {
  aff: Uint8Array
  dic: Uint8Array
}

/**
 * Case-insensitive Damerau-Levenshtein-Distanz (OSA) für das Ranking der
 * Vorschläge. Transposition zählt 1, weil vertauschte Buchstaben der
 * häufigste Tippfehler sind — sonst schlüge bei „Terminvorschalg" die
 * Löschung („Terminvorschal") die eigentliche Korrektur.
 */
export function editDistance(a: string, b: string): number {
  const s = a.toLowerCase()
  const t = b.toLowerCase()
  if (s === t) return 0
  const m = s.length
  const n = t.length
  if (m === 0) return n
  if (n === 0) return m
  let prevPrev = new Array<number>(n + 1)
  let prev = Array.from({ length: n + 1 }, (_, j) => j)
  let cur = new Array<number>(n + 1)
  for (let i = 1; i <= m; i++) {
    cur[0] = i
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (s[i - 1] === t[j - 1] ? 0 : 1))
      if (i > 1 && j > 1 && s[i - 1] === t[j - 2] && s[i - 2] === t[j - 1]) {
        cur[j] = Math.min(cur[j], prevPrev[j - 2] + 1)
      }
    }
    ;[prevPrev, prev, cur] = [prev, cur, prevPrev]
  }
  return prev[n]
}

/**
 * Mischt Kandidaten beider Sprachen und sortiert nach Nähe zum Tippfehler —
 * sonst landen bei „occured" deutsche Exoten („zurede") vor „occurred".
 * Gleichstand: passende Groß-/Kleinschreibung des Anfangsbuchstabens gewinnt,
 * danach bleibt die Hunspell-Reihenfolge stabil erhalten.
 */
export function rankSuggestions(word: string, candidates: string[], limit = 5): string[] {
  const wordUpper = word[0] === word[0]?.toUpperCase()
  const seen = new Set<string>()
  const scored: Array<{ s: string; dist: number; caseMatch: number; idx: number }> = []
  for (const [idx, s] of candidates.entries()) {
    if (!s || s === word || seen.has(s)) continue
    seen.add(s)
    scored.push({
      s,
      dist: editDistance(word, s),
      caseMatch: (s[0] === s[0].toUpperCase()) === wordUpper ? 0 : 1,
      idx
    })
  }
  scored.sort((a, b) => a.dist - b.dist || a.caseMatch - b.caseMatch || a.idx - b.idx)
  return scored.slice(0, limit).map((c) => c.s)
}

/**
 * Rechtschreibprüfung über mehrere Hunspell-Wörterbücher (DE + EN): ein Wort
 * gilt als korrekt, sobald ein Wörterbuch es akzeptiert. Deutsche Klitika
 * („geht's", „gibt's") stehen nicht im igerman98 — dafür gibt es den Fallback
 * ohne ’s-Suffix.
 */
export class SpellEngine {
  private constructor(private readonly dicts: Hunspell[]) {}

  static async create(buffers: DictBuffers[]): Promise<SpellEngine> {
    const factory = await loadModule()
    const dicts = buffers.map((buf, i) => {
      const aff = factory.mountBuffer(buf.aff, `dict-${i}.aff`)
      const dic = factory.mountBuffer(buf.dic, `dict-${i}.dic`)
      return factory.create(aff, dic)
    })
    return new SpellEngine(dicts)
  }

  isCorrect(word: string): boolean {
    if (this.dicts.some((d) => d.spell(word))) return true
    const clitic = word.match(/^(.{2,})['’]s$/)
    if (clitic && this.dicts.some((d) => d.spell(clitic[1]))) return true
    return false
  }

  /** Liefert die falsch geschriebenen Wörter (dedupliziert, Eingabereihenfolge). */
  check(words: string[]): string[] {
    const misspelled: string[] = []
    const seen = new Set<string>()
    for (const word of words) {
      if (seen.has(word)) continue
      seen.add(word)
      if (!this.isCorrect(word)) misspelled.push(word)
    }
    return misspelled
  }

  suggest(word: string, limit = 5): string[] {
    if (this.isCorrect(word)) return []
    const candidates = this.dicts.flatMap((d) => d.suggest(word))
    return rankSuggestions(word, candidates, limit)
  }
}
