export interface PaletteCommandDescriptor {
  id: string
  label: string
  note?: string
}

export interface PaletteQueryRoute {
  commandQuery: string
  commandIds: string[]
  forcedCommands: boolean
}

export interface PaletteSelection {
  id: string | null
  manual: boolean
}

function searchable(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function commandScore(command: PaletteCommandDescriptor, query: string): number {
  const label = searchable(command.label)
  const note = searchable(command.note ?? '')
  const haystack = `${label} ${note}`.trim()

  if (label === query) return 1_000
  if (label.startsWith(query)) return 700
  if (label.includes(` ${query}`)) return 600
  if (haystack.includes(query)) return 500

  const tokens = query.split(' ').filter(Boolean)
  return tokens.length > 0 && tokens.every((token) => haystack.includes(token)) ? 300 : 0
}

/**
 * Filtert die Befehlspalette ohne UI-Zustand. Seit die Mailsuche in der
 * Owl-View lebt (/), gibt es hier kein Mode-Routing mehr — die Palette
 * kennt nur noch Befehle. Ein fuehrendes `>` bleibt als bewusster
 * Nur-Befehle-Modus erhalten (alte Muskelerinnerung tut nicht weh).
 */
export function routePaletteQuery(
  rawQuery: string,
  commands: PaletteCommandDescriptor[]
): PaletteQueryRoute {
  const trimmed = rawQuery.trim()
  const forcedCommands = trimmed.startsWith('>')
  const commandQuery = (forcedCommands ? trimmed.slice(1) : trimmed).trim()
  const normalizedQuery = searchable(commandQuery)

  if (!normalizedQuery) {
    return {
      commandQuery,
      commandIds: commands.map((command) => command.id),
      forcedCommands
    }
  }

  const scored = commands
    .map((command, position) => ({
      command,
      position,
      score: commandScore(command, normalizedQuery)
    }))
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score || a.position - b.position)

  return {
    commandQuery,
    commandIds: scored.map((match) => match.command.id),
    forcedCommands
  }
}

/** Nur echte sichtbare Mailboxen werden beim Oeffnen umgeschaltet. */
export function visibleMailboxForSearchHit(
  mailbox: 'inbox' | 'sent' | 'archive' | 'other'
): 'inbox' | 'sent' | null {
  return mailbox === 'inbox' || mailbox === 'sent' ? mailbox : null
}

/**
 * Automatische Auswahl folgt dem jeweils ersten priorisierten Ergebnis.
 * Sobald der Nutzer navigiert hat, bleibt seine Auswahl bei asynchronen Updates stabil.
 */
export function reconcilePaletteSelection(
  current: PaletteSelection,
  entryIds: string[]
): PaletteSelection {
  const firstId = entryIds[0] ?? null
  const stillVisible = current.id !== null && entryIds.includes(current.id)
  const nextId = current.manual && stillVisible ? current.id : firstId
  return nextId === current.id ? current : { id: nextId, manual: false }
}
