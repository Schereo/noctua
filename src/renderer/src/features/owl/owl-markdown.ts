/**
 * Miniatur-Markdown für Eulen-Antworten — genau die Teilmenge, die die
 * Modelle tatsächlich produzieren: **fett**, *kursiv*, `Code`, - /1. Listen,
 * ###-Überschriften und [n]-Quellenverweise. Bewusst ohne Dependency und
 * ohne HTML: der Parser liefert eine Struktur, gerendert wird mit React-
 * Elementen (kein dangerouslySetInnerHTML). Läuft auch auf halbfertigen
 * Streaming-Texten — unvollständige Auszeichnung bleibt einfach Klartext.
 */

export type OwlInline =
  | { kind: 'text'; text: string }
  | { kind: 'bold'; text: string }
  | { kind: 'italic'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'source'; n: number }

export type OwlBlock =
  | { kind: 'paragraph'; lines: OwlInline[][] }
  | { kind: 'heading'; inlines: OwlInline[] }
  | { kind: 'list'; ordered: boolean; items: OwlInline[][] }

const INLINE_RE = /(\*\*([^*\n]+)\*\*)|(\*([^*\n]+)\*)|(`([^`\n]+)`)|(\[(\d{1,3})\])/g

/** Zerlegt eine Zeile in Inline-Stücke; unvollständige Marker bleiben Text. */
export function parseInlines(line: string): OwlInline[] {
  const out: OwlInline[] = []
  let pos = 0
  for (const m of line.matchAll(INLINE_RE)) {
    if (m.index > pos) out.push({ kind: 'text', text: line.slice(pos, m.index) })
    if (m[2] !== undefined) out.push({ kind: 'bold', text: m[2] })
    else if (m[4] !== undefined) out.push({ kind: 'italic', text: m[4] })
    else if (m[6] !== undefined) out.push({ kind: 'code', text: m[6] })
    else out.push({ kind: 'source', n: Number(m[8]) })
    pos = m.index + m[0].length
  }
  if (pos < line.length) out.push({ kind: 'text', text: line.slice(pos) })
  return out
}

/**
 * Sammelt die im Antworttext zitierten [n]-Indizes — Reihenfolge des ersten
 * Auftretens, ohne Duplikate. Läuft über denselben Parser wie das Rendering:
 * gezählt wird genau, was dort als Quellverweis klickbar würde (ein [n] in
 * einem Code-Span etwa nicht).
 */
export function citedSourceIndices(text: string): number[] {
  const seen = new Set<number>()
  const collect = (inlines: OwlInline[]): void => {
    for (const inline of inlines) if (inline.kind === 'source') seen.add(inline.n)
  }
  for (const block of parseOwlMarkdown(text)) {
    if (block.kind === 'heading') collect(block.inlines)
    else if (block.kind === 'list') block.items.forEach(collect)
    else block.lines.forEach(collect)
  }
  return [...seen]
}

const BULLET_RE = /^\s*[-*•]\s+(.*)$/
const ORDERED_RE = /^\s*\d{1,3}[.)]\s+(.*)$/
const HEADING_RE = /^#{1,4}\s+(.*)$/

/** Zerlegt den Antworttext in Blöcke (Absätze, Listen, Überschriften). */
export function parseOwlMarkdown(text: string): OwlBlock[] {
  const blocks: OwlBlock[] = []
  let paragraph: OwlInline[][] = []
  let list: { ordered: boolean; items: OwlInline[][] } | null = null

  const flushParagraph = (): void => {
    if (paragraph.length > 0) blocks.push({ kind: 'paragraph', lines: paragraph })
    paragraph = []
  }
  const flushList = (): void => {
    if (list) blocks.push({ kind: 'list', ordered: list.ordered, items: list.items })
    list = null
  }

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trimEnd()
    if (line.trim() === '') {
      flushParagraph()
      flushList()
      continue
    }
    const heading = line.match(HEADING_RE)
    if (heading) {
      flushParagraph()
      flushList()
      blocks.push({ kind: 'heading', inlines: parseInlines(heading[1]) })
      continue
    }
    const bullet = line.match(BULLET_RE)
    const ordered = line.match(ORDERED_RE)
    if (bullet || ordered) {
      flushParagraph()
      const isOrdered = !ordered ? false : !bullet
      if (!list || list.ordered !== isOrdered) {
        flushList()
        list = { ordered: isOrdered, items: [] }
      }
      list.items.push(parseInlines((bullet ?? ordered)![1]))
      continue
    }
    flushList()
    // Volle **Fett**-Zeile wirkt wie eine Zwischenüberschrift (häufiges
    // Modell-Muster) — als eigener Absatz beginnen, damit sie freisteht.
    if (/^\*\*[^*]+\*\*:?$/.test(line.trim())) {
      flushParagraph()
      blocks.push({ kind: 'heading', inlines: parseInlines(line.trim()) })
      continue
    }
    paragraph.push(parseInlines(line))
  }
  flushParagraph()
  flushList()
  return blocks
}
