import type { MessageDetail } from '@shared/types'

// Empfänger-Berechnung für Antworten (M80). Pure Funktion, damit die Regeln
// testbar sind — EmailSheet ruft sie sowohl fürs Senden als auch für die
// Empfänger-Zeile über dem Composer auf.
//
// Regeln:
//  - Gerichtet wird auf die letzte fremde Nachricht des Threads (Fallback:
//    letzte Nachricht, wenn der Thread nur eigene enthält).
//  - AN = Reply-To-Header dieser Nachricht; ohne Reply-To deren From.
//  - ALLE: CC = deren ursprüngliche An-/CC-Empfänger, abzüglich aller eigenen
//    Adressen (der Nutzer kann mehrere Konten haben), der AN-Adressen und
//    Duplikaten (case-insensitiv, Reihenfolge bleibt erhalten).

export type ReplyScope = 'sender' | 'all'

export type ReplyMessage = Pick<
  MessageDetail,
  'id' | 'fromAddr' | 'to' | 'cc' | 'replyTo' | 'subject'
>

export interface ReplyRecipients {
  to: string[]
  cc: string[]
  subject: string
  replyToMessageId: number
}

function dedupe(addresses: string[], exclude: ReadonlySet<string>): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const address of addresses) {
    const key = address.trim().toLowerCase()
    if (!key || exclude.has(key) || seen.has(key)) continue
    seen.add(key)
    result.push(address.trim())
  }
  return result
}

export function buildReplyRecipients(
  messages: ReplyMessage[],
  ownEmails: string[],
  scope: ReplyScope
): ReplyRecipients | null {
  if (messages.length === 0) return null
  const own = new Set(ownEmails.map((e) => e.trim().toLowerCase()).filter(Boolean))
  const last = messages[messages.length - 1]
  const lastForeign =
    [...messages].reverse().find((m) => !own.has((m.fromAddr ?? '').toLowerCase())) ?? last

  const to = dedupe(
    lastForeign.replyTo.length > 0
      ? lastForeign.replyTo.map((r) => r.address)
      : lastForeign.fromAddr
        ? [lastForeign.fromAddr]
        : [],
    new Set()
  )
  // Degenerierter Fall (Thread nur aus eigenen Nachrichten): Antwort an die
  // eigene Adresse — wie vor M80.
  if (to.length === 0 && lastForeign.fromAddr) to.push(lastForeign.fromAddr)

  const toKeys = new Set(to.map((a) => a.toLowerCase()))
  const cc =
    scope === 'all'
      ? dedupe(
          [...lastForeign.to, ...lastForeign.cc].map((r) => r.address),
          new Set([...own, ...toKeys])
        )
      : []

  const subject = `Re: ${(lastForeign.subject ?? '').replace(/^(re|aw)\s*:\s*/i, '')}`
  return { to, cc, subject, replyToMessageId: last.id }
}
