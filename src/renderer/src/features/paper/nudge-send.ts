// Pure Logik des Stups-Versands (Wartet-Ansicht) — getrennt von der
// WaitingSheet-Komponente, damit sie unter Node/Vitest testbar bleibt.

/** Gestupst gilt für den Kalendertag — ab Mitternacht darf wieder gestupst werden. */
export function nudgedToday(nudgedAt: number | null, now = Date.now()): boolean {
  if (!nudgedAt) return false
  const a = new Date(nudgedAt)
  const b = new Date(now)
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

export interface NudgeSendPayload {
  accountId: number
  to: string[]
  cc: string[]
  bcc: string[]
  subject: string
  textBody: string
  htmlBody: string
  replyToMessageId: number
}

/**
 * Baut die compose:send-Payload für einen Stups. Die Signatur wird bewusst
 * NICHT angehängt: der Versand-Pfad (sendMail/appendSignatureText) ergänzt die
 * Konto-Signatur genau einmal — exakt derselbe Weg wie bei Antworten.
 * replyToMessageId zeigt auf die eigene gesendete Mail, damit der Stups beim
 * Empfänger im richtigen Thread landet (In-Reply-To/References).
 */
export function buildNudgeSend(
  followup: { messageId: number; accountId: number; subject: string | null; toAddrs: string[] },
  text: string,
  htmlBody: string
): NudgeSendPayload {
  return {
    accountId: followup.accountId,
    to: followup.toAddrs,
    cc: [],
    bcc: [],
    subject: `Re: ${(followup.subject ?? '').replace(/^(re|aw)\s*:\s*/i, '')}`,
    textBody: text.trimEnd(),
    htmlBody,
    replyToMessageId: followup.messageId
  }
}
