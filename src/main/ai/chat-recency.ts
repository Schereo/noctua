/**
 * Aktualitäts-Kanal des Chat-Retrievals: Vektor- und Volltext-Suche sind rein
 * thematisch — „Welche Mails kamen heute an?" fand deshalb thematisch passende
 * statt neuer Mails. Die neuesten Threads laufen jetzt immer als eigener Kanal
 * mit; bei erkennbarem Zeitbezug in der Frage rücken sie an die Spitze.
 */

const TEMPORAL_PATTERNS: RegExp[] = [
  /\bheute\b/i,
  /\bgestern\b/i,
  /\bvorgestern\b/i,
  /\bgerade\s+eben\b/i,
  /\bzuletzt\b/i,
  /\bneueste[nrs]?\b/i,
  /\bjüngste[nrs]?\b/i,
  /\baktuellste[nrs]?\b/i,
  /\bletzte[nrs]?\s+(woche|monat|tag|stunde|zeit|mails?|nachricht)/i,
  /\bdiese[nr]?\s+(woche|monat)\b/i,
  /\btoday\b/i,
  /\byesterday\b/i,
  /\blatest\b/i,
  /\bnewest\b/i,
  /\brecent(ly)?\b/i,
  /\bthis\s+(week|month)\b/i,
  /\blast\s+(week|month|days?|hours?)\b/i
]

/** Fragt die Frage nach einem Zeitbezug („heute", „letzte Woche", „latest"…). */
export function isTemporalQuestion(question: string): boolean {
  return TEMPORAL_PATTERNS.some((re) => re.test(question))
}

/**
 * Mischt thematische Kandidaten mit den neuesten Threads. Zeitbezug in der
 * Frage ⇒ die neuesten zuerst (sie SIND die Antwort); sonst füllen sie hinten
 * auf, damit „Was ist neu?"-artige Anschlussfragen Material haben.
 */
export function blendThreadKeys(params: {
  topical: string[]
  newest: string[]
  temporal: boolean
  cap: number
}): string[] {
  const ordered = params.temporal
    ? [...params.newest, ...params.topical]
    : [...params.topical, ...params.newest]
  return [...new Set(ordered)].slice(0, Math.max(1, params.cap))
}
