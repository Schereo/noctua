// Zitat-Historie („Am … schrieb …:", „On … wrote:", >-Blöcke, gmail_quote)
// vom eigentlichen Nachrichtentext trennen — der Verlauf steckt in jeder
// Antwort erneut und macht Threads sonst unlesbar.

const TEXT_MARKERS = [
  /^Am .{4,80} schrieb .{2,120}:\s*$/,
  /^On .{4,120} wrote:\s*$/,
  /^Le .{4,80} a écrit\s*:\s*$/,
  /^-{2,}\s*(Original Message|Ursprüngliche Nachricht|Forwarded message|Weitergeleitete Nachricht)\s*-{0,}\s*$/i,
  /^_{10,}\s*$/,
  /^Von:\s.+$/
]

export function splitTextQuote(text: string): { visible: string; quoted: string | null } {
  const lines = text.split('\n')
  let cut = -1
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (TEXT_MARKERS.some((rx) => rx.test(line))) {
      cut = i
      break
    }
    // Beginn eines zusammenhängenden >-Zitatblocks (mind. 2 Zeilen)
    if (line.startsWith('>') && (lines[i + 1] ?? '').trim().startsWith('>')) {
      cut = i
      break
    }
  }
  if (cut <= 0) return { visible: text, quoted: null }
  const visible = lines.slice(0, cut).join('\n').trimEnd()
  const quoted = lines.slice(cut).join('\n').trim()
  if (!visible) return { visible: text, quoted: null }
  return { visible, quoted: quoted || null }
}

const HTML_QUOTE_SELECTORS = [
  '.gmail_quote',
  'blockquote[type="cite"]',
  '#divRplyFwdMsg',
  '.yahoo_quoted',
  '.moz-cite-prefix',
  '.protonmail_quote'
].join(',')

export function splitHtmlQuote(html: string): { visible: string; quoted: string | null } {
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const first = doc.body.querySelector(HTML_QUOTE_SELECTORS)
    if (!first) return { visible: html, quoted: null }
    // Das Zitat-Element plus alles danach (Signatur-Reste des Zitats etc.)
    const range = doc.createRange()
    range.setStartBefore(first)
    range.setEnd(doc.body, doc.body.childNodes.length)
    const frag = range.extractContents()
    const container = doc.createElement('div')
    container.appendChild(frag)
    const visible = doc.body.innerHTML.trim()
    const quoted = container.innerHTML.trim()
    if (!visible || !quoted) return { visible: html, quoted: null }
    return { visible, quoted }
  } catch {
    return { visible: html, quoted: null }
  }
}
