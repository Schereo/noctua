/**
 * Adressat-Erkennung für die Aufgaben-Extraktion: Aufgaben dürfen nur
 * entstehen, wenn der Kontoinhaber wirklich gemeint ist — nicht bei
 * Verteiler-Zustellung an andere („Hallo Jannik" via Mailingliste).
 *
 * Drei Stufen, hier als pure Funktionen:
 *   1. Envelope: Wo steht die Konto-Adresse (An/CC/gar nicht)?
 *   2. Anrede: Wen spricht die erste Zeile namentlich an?
 *   3. LLM: addressed_to_me aus der Triage (probabilistisch, default true).
 * `taskAddresseeVerdict` bündelt alles zu 'create' | 'suggest' | 'none'.
 */

export type RecipientPlacement = 'to' | 'cc' | 'absent'

export type SalutationTarget =
  { kind: 'named'; names: string[] } | { kind: 'group' } | { kind: 'none' }

export type AddresseeVerdict = 'create' | 'suggest' | 'none'

export interface OwnerIdentity {
  email?: string | null
  displayName?: string | null
  accountName?: string | null
}

function parseAddressList(json: string | null | undefined): string[] | null {
  if (json == null) return null
  try {
    const list = JSON.parse(json) as Array<{ address?: string | null }>
    if (!Array.isArray(list)) return null
    return list.map((r) => (r.address ?? '').trim().toLowerCase()).filter(Boolean)
  } catch {
    return null
  }
}

/**
 * Stufe 1 — Platzierung der Konto-Adresse im Envelope.
 * 'absent' = weder An noch CC (Verteiler-/Bcc-Zustellung).
 * Ohne Konto-Adresse oder ohne verwertbare Envelope-Daten neutral 'to',
 * damit unvollständige Altdaten nichts fälschlich unterdrücken.
 */
export function recipientPlacement(
  accountEmail: string | null | undefined,
  toJson: string | null | undefined,
  ccJson: string | null | undefined
): RecipientPlacement {
  const email = accountEmail?.trim().toLowerCase()
  if (!email) return 'to'
  const to = parseAddressList(toJson)
  const cc = parseAddressList(ccJson)
  if (to === null && cc === null) return 'to'
  if (to?.includes(email)) return 'to'
  if (cc?.includes(email)) return 'cc'
  return 'absent'
}

// Grußformeln am Zeilenanfang („Hallo", „Sehr geehrte Frau …", „Dear …").
const GREETING =
  /^(?:hallo|hall(?:ö|o)chen|hi|hey|hej|huhu|moin(?:\s+moin)?|servus|gr(?:ü|u)(?:ß|ss)\s+(?:dich|euch|gott)|guten\s+(?:morgen|tag|abend)|liebste[rs]?|liebe[rs]?|sehr\s+geehrte[rs]?|werte[rs]?|dear|hello|good\s+(?:morning|afternoon|evening))\b/i

// Anreden an eine Gruppe oder direkt an „dich, den Leser" — kein Namens-Signal.
const GROUP_TARGET =
  /^(?:ihr\s+lieben|damen\s+und\s+herren|kolleg\p{L}*(?:\s+und\s+kolleg\p{L}*)?|team\p{L}*|zusammen|alle(?:rseits)?|miteinander|leute|freunde|folks|everyone|everybody|all|guys|ihr|du|sie)\b/iu

// Titel vor Namen, die beim Vergleich nichts beitragen.
const TITLE = /^(?:herrn?|frau|fr(?:ä|a)ulein|dr|prof|mr|mrs|ms|miss|sir|madam)\.?$/i

function firstUnquotedLine(text: string): string | null {
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/[\u200b-\u200d\ufeff\ufffc]/g, '').trim()
    if (!line) continue
    if (line.startsWith('>')) continue
    return line
  }
  return null
}

function cleanNameToken(token: string): string {
  return token.replace(/^[("'„“”«»]+/, '').replace(/[.,!?:;)"'„“”«»]+$/, '')
}

// Namens-Token: großgeschrieben, nur Buchstaben/Bindestrich/Apostroph.
// Die Großschreibungs-Pflicht ist bewusst: Ein falsches „fremder Name" wäre
// ein hartes Nein — im Zweifel lieber neutral bleiben.
function isNameToken(token: string): boolean {
  if (token.length < 2 || token.length > 30) return false
  return /^\p{Lu}[\p{L}'’-]*$/u.test(token)
}

/**
 * Stufe 2 — Wen spricht die erste nicht-zitierte Zeile an?
 * 'named' mit den erkannten Namen, 'group' bei „zusammen"/„alle"/„Team"/…,
 * 'none' ohne (verwertbare) Anrede.
 */
export function salutationTarget(bodyText: string | null | undefined): SalutationTarget {
  const line = firstUnquotedLine(bodyText ?? '')
  if (!line) return { kind: 'none' }
  const greeting = GREETING.exec(line)
  if (!greeting) return { kind: 'none' }
  const rest = line
    .slice(greeting[0].length)
    .replace(/^[\s,!:;–—-]+/, '')
    .trim()
  if (!rest) return { kind: 'none' }
  if (GROUP_TARGET.test(rest)) return { kind: 'group' }

  // „Hallo Tim und Anna," / „Liebe Marie, lieber Tom, hier …" — Segmente bis
  // zum ersten Nicht-Namen (dort beginnt der Satz).
  const names: string[] = []
  for (const segment of rest.split(/\s*(?:,|;|\bund\b|\band\b|&|\+|\/)\s*/i)) {
    if (!segment) continue
    const withoutGreeting = segment.replace(GREETING, '').replace(/^[\s,!]+/, '')
    const tokens = withoutGreeting
      .split(/\s+/)
      .map(cleanNameToken)
      .filter((t) => t.length > 0 && !TITLE.test(t))
    if (tokens.length === 0) continue // reines Titel-Segment
    if (tokens.length > 3 || !tokens.every(isNameToken)) break
    names.push(tokens.join(' '))
  }
  return names.length > 0 ? { kind: 'named', names } : { kind: 'none' }
}

// Case- und diakritik-tolerante Normalisierung (Jörg → jorg, Groß → gross).
function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function nameTokens(value: string): string[] {
  return normalizeName(value)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length >= 2)
}

/**
 * Stufe 2b — Nennt eine Anrede den Kontoinhaber? Verglichen wird gegen
 * Namens-Tokens aus display_name, account_name und dem Local-Part der
 * Adresse (lena.hartmann → lena, hartmann; lena.hartmann12 zusätzlich ohne Ziffern).
 */
export function namesMatchOwner(names: string[], owner: OwnerIdentity): boolean {
  const ownerTokens = new Set<string>()
  const add = (value: string | null | undefined): void => {
    for (const token of nameTokens(value ?? '')) {
      ownerTokens.add(token)
      const withoutDigits = token.replace(/\p{N}+/gu, '')
      if (withoutDigits.length >= 2) ownerTokens.add(withoutDigits)
    }
  }
  add(owner.displayName)
  add(owner.accountName)
  add(owner.email?.split('@')[0])
  if (ownerTokens.size === 0) return false
  return names.some((name) => nameTokens(name).some((token) => ownerTokens.has(token)))
}

export interface AddresseeContext {
  accountEmail?: string | null
  displayName?: string | null
  accountName?: string | null
  toJson?: string | null
  ccJson?: string | null
  /** Eigener Mailtext (ohne weitergeleiteten Block) für die Anrede-Analyse. */
  bodyText?: string | null
  /** LLM-Einschätzung addressed_to_me; fehlend/null = true (Alt-Annotationen). */
  addressedToMe?: boolean | null
}

/**
 * Gesamtpolitik: Ist der Kontoinhaber gemeint?
 *   - Anrede nennt den Inhaber (allein oder unter mehreren) ⇒ 'create' —
 *     überstimmt auch 'absent' (via Verteiler persönlich angesprochen).
 *   - Anrede nennt AUSSCHLIESSLICH fremde Namen ⇒ 'none' (auch bei An).
 *   - Weder An noch CC (Verteiler/Bcc) ⇒ 'none'; nur CC ⇒ 'none' (wie bisher).
 *   - Sonst (An + neutrale Anrede): addressed_to_me=false ⇒ nur Vorschlag
 *     ('suggest'), andernfalls 'create'.
 * 'create' heißt „darf automatisch angelegt werden" — der M50-Toggle
 * (tasks.autoCreate) liegt weiterhin ÜBER dieser Politik.
 */
export function taskAddresseeVerdict(ctx: AddresseeContext): AddresseeVerdict {
  const owner: OwnerIdentity = {
    email: ctx.accountEmail,
    displayName: ctx.displayName,
    accountName: ctx.accountName
  }
  const salutation = salutationTarget(ctx.bodyText)
  if (salutation.kind === 'named') {
    return namesMatchOwner(salutation.names, owner) ? 'create' : 'none'
  }
  const placement = recipientPlacement(ctx.accountEmail, ctx.toJson, ctx.ccJson)
  if (placement !== 'to') return 'none'
  return ctx.addressedToMe === false ? 'suggest' : 'create'
}
