// Maß-Helfer der Technik-Grafiken — reine Funktionen, getrennt von den
// SVG-Komponenten (react-refresh mag gemischte Exporte nicht).

/** Monospace-Breitenschätzung: IBM Plex Mono ≈ 0.6 em pro Zeichen. */
export function monoW(text: string, size: number): number {
  return text.length * size * 0.602
}

/** Chip-Breite aus dem Text — auch für linksbündiges Setzen der Chips. */
export function chipWidth(text: string, size = 8.5): number {
  return monoW(text, size) + text.length * 0.8 + 14
}
