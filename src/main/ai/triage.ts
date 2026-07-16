import type Database from 'better-sqlite3'
import { z } from 'zod'
import { htmlToText } from '../mail/parser'
import { extractUsage, getOpenRouter, getTriageModel, providerBody } from './openrouter'
import { logUsage } from './budget'
import { createTasksFromTriage, isUserAuthoredMail } from '../db/repos/tasks'
import { isForwardWithoutRequest, textBeforeForwardedMessage } from '../mail/forwarded'
import { recipientPlacement, salutationTarget } from './addressee'
import { localStamp } from './prompt-date'

export const PROMPT_VERSION = 5

export const AI_CATEGORIES = [
  'personal',
  'work',
  'newsletter',
  'promotions',
  'notifications',
  'transactional',
  'other'
] as const

// Action-Items als Objekt mit optionaler Frist; v1-Strings werden toleriert.
const actionItemSchema = z.union([
  z.object({
    title: z.string().max(200),
    due: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .default(null)
  }),
  z
    .string()
    .max(200)
    .transform((title) => ({ title, due: null as string | null }))
])

const triageResultSchema = z.object({
  category: z.enum(AI_CATEGORIES),
  priority: z.number().int().min(1).max(5),
  summary: z.string().max(300),
  action_items: z.array(actionItemSchema).max(5).default([]),
  needs_reply: z.boolean().default(false),
  // Abwärtskompatibel: Alt-Antworten (Prompt v4) ohne das Feld gelten als adressiert.
  addressed_to_me: z.boolean().default(true),
  confidence: z.number().min(0).max(1).default(0.5)
})

const SYSTEM_PROMPT = `Du bist der Triage-Klassifikator eines persönlichen E-Mail-Clients.
Analysiere die E-Mail und antworte AUSSCHLIESSLICH mit einem JSON-Objekt, exakt in dieser Form:
{
  "category": "personal" | "work" | "newsletter" | "promotions" | "notifications" | "transactional" | "other",
  "priority": 1-5,
  "summary": "Einzeiler auf Deutsch, max. 140 Zeichen, sachlich",
  "action_items": [{"title": "konkrete Aufgabe für den Empfänger", "due": "YYYY-MM-DD oder null"}],
  "needs_reply": true|false,
  "addressed_to_me": true|false,
  "confidence": 0.0-1.0
}

addressed_to_me: true NUR, wenn der im EMPFÄNGER-Block genannte Kontoinhaber
persönlich gemeint ist (namentlich angesprochen, direkt adressiert oder klar
Adressat der Bitte). false, wenn Anrede oder Bitte sich an eine andere Person
richtet (z. B. Anrede mit fremdem Namen, Verteiler-Mail für jemand anderen,
Mail nur zur Kenntnis).
action_items NUR, wenn ein Mensch den genannten Kontoinhaber persönlich um
etwas bittet oder eine echte Frist für IHN existiert (zahlen, antworten,
buchen, kündigen, vorbereiten). Richtet sich die Anrede oder Bitte an eine
andere Person, KEINE action_items und needs_reply=false.
NIEMALS action_items aus: Login-/Anmelde-Benachrichtigungen („neue Anmeldung",
„Sicherheitswarnung", 2FA-/Verifizierungs-Codes), Passwort-Mails,
Systembenachrichtigungen, Newslettern, Werbung oder reinen Infos — auch wenn
der Text Handlungsaufforderungen wie „überprüfe/ändere dein Passwort" enthält;
solche Standard-Sicherheitshinweise sind KEINE Aufgaben des Nutzers.
due nur setzen, wenn eine konkrete Frist erkennbar ist (relativ zum Mail-Datum
in ein absolutes Datum umrechnen), sonst null.

Kategorien:
- personal: echte Menschen, private Kommunikation
- work: berufliche Kommunikation von echten Menschen
- newsletter: redaktionelle Mailings, Digests
- promotions: Werbung, Angebote, Marketing — auch Produktankündigungen und
  Feature-Marketing von Diensten, die der Empfänger bereits nutzt
- notifications: automatische Benachrichtigungen von Diensten (Social, Tools, Kalender)
- transactional: Rechnungen, Bestellungen, Versand, Sicherheitscodes, Verträge
- other: nichts davon

Priorität: 5 = dringend/wichtig für den Empfänger (Mensch wartet auf Antwort, harte Frist,
Sicherheitsvorfall), 4 = Dienst-Warnungen, die bei Ignorieren zu Einschränkungen führen
(Speicher voll, Zahlung fehlgeschlagen, Konto-Sperrung droht), 3 = normal,
1 = ignorierbar (Massenwerbung, Smalltalk-Duplikate).
needs_reply nur bei echten Menschen mit Antworterwartung.
summary nennt den Kern (wer will was), keine Floskeln.`

interface TriageRow {
  id: number
  account_id: number
  subject: string | null
  from_name: string | null
  from_addr: string | null
  to_json: string | null
  cc_json: string | null
  account_email: string | null
  account_display_name: string | null
  account_name: string | null
  date: number | null
  list_unsubscribe: number
  text_plain: string | null
  html_raw: string | null
  folder_special_use: string | null
}

function buildUserPrompt(db: Database.Database, row: TriageRow): string {
  const fullBodyText = row.text_plain?.trim() || htmlToText(row.html_raw ?? '')
  const bodyText = textBeforeForwardedMessage(row.subject, fullBodyText).slice(0, 6000)
  const stats = db
    .prepare('SELECT sent_count FROM contact_stats WHERE account_id = ? AND addr = ?')
    .get(row.account_id, row.from_addr ?? '') as { sent_count: number } | undefined
  const previous = db
    .prepare(
      `SELECT coalesce(a.user_override_category, a.category) cat, count(*) n
       FROM ai_annotations a JOIN messages m ON m.id = a.message_id
       WHERE m.account_id = ? AND m.from_addr = ? GROUP BY cat ORDER BY n DESC LIMIT 1`
    )
    .get(row.account_id, row.from_addr ?? '') as { cat: string } | undefined

  const signals = [
    row.list_unsubscribe ? 'List-Unsubscribe-Header vorhanden (Massenmail-Signal)' : null,
    stats && stats.sent_count > 0
      ? `Der Empfänger hat diesem Absender schon ${stats.sent_count}× geschrieben (bekannter Kontakt)`
      : null,
    previous ? `Frühere Mails dieses Absenders wurden als "${previous.cat}" eingeordnet` : null
  ].filter(Boolean)

  // EMPFÄNGER-Block: Wer ist der Kontoinhaber, wo steht er im Envelope,
  // wen spricht die Anrede an? Grundlage für addressed_to_me.
  const ownerName = row.account_display_name?.trim() || row.account_name?.trim() || null
  const placement = recipientPlacement(row.account_email, row.to_json, row.cc_json)
  const placementLabel = {
    to: 'steht im An',
    cc: 'steht nur im CC',
    absent: 'ist weder in An noch CC (Verteiler-/Bcc-Zustellung)'
  }[placement]
  const salutation = salutationTarget(bodyText)
  const salutationLabel =
    salutation.kind === 'named'
      ? `nennt namentlich: ${salutation.names.join(', ')}`
      : salutation.kind === 'group'
        ? 'Gruppenanrede (z. B. „Hallo zusammen")'
        : 'keine erkennbare Anrede'

  return [
    `Von: ${row.from_name ?? ''} <${row.from_addr ?? 'unbekannt'}>`,
    `Betreff: ${row.subject ?? '(kein Betreff)'}`,
    `Datum: ${row.date ? localStamp(row.date) : 'unbekannt'}`,
    `EMPFÄNGER (Kontoinhaber): ${ownerName ? `${ownerName} ` : ''}<${row.account_email ?? 'unbekannt'}>; ${placementLabel}; Anrede der Mail: ${salutationLabel}`,
    signals.length > 0 ? `Signale: ${signals.join('; ')}` : null,
    '',
    'Inhalt:',
    bodyText || '(kein Textinhalt)'
  ]
    .filter((line) => line !== null)
    .join('\n')
}

export type TriageOutcome = 'done' | 'skipped-no-client' | 'skipped-missing'

/** Klassifiziert eine Nachricht und schreibt die Annotation. Wirft bei API-Fehlern. */
export async function runTriage(db: Database.Database, messageId: number): Promise<TriageOutcome> {
  const client = getOpenRouter()
  if (!client) return 'skipped-no-client'

  const row = db
    .prepare(
      `SELECT m.id, m.account_id, m.subject, m.from_name, m.from_addr, m.to_json, m.cc_json,
              m.date, m.list_unsubscribe, b.text_plain, b.html_raw, a.email account_email,
              a.display_name account_display_name, a.account_name,
              f.special_use folder_special_use
       FROM messages m LEFT JOIN message_bodies b ON b.message_id = m.id
       LEFT JOIN accounts a ON a.id = m.account_id
       LEFT JOIN folders f ON f.id = m.folder_id
       WHERE m.id = ?`
    )
    .get(messageId) as TriageRow | undefined
  if (!row) return 'skipped-missing'

  const model = getTriageModel()
  const userPrompt = buildUserPrompt(db, row)

  let lastError = ''
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await client.chat.completions.create({
      ...providerBody(),
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content:
            attempt === 0
              ? userPrompt
              : `${userPrompt}\n\nDeine letzte Antwort war ungültig (${lastError}). Antworte exakt nach Schema.`
        }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 500,
      // OpenRouter-Erweiterung: Kosten in der Response mitliefern
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...({ usage: { include: true } } as any)
    })

    const { inputTokens, outputTokens, costUsd } = extractUsage(response.usage)
    logUsage(db, model, inputTokens, outputTokens, costUsd)

    const raw = response.choices[0]?.message?.content ?? ''
    let parsed: z.infer<typeof triageResultSchema> | null = null
    try {
      parsed = triageResultSchema.parse(JSON.parse(raw))
    } catch (error) {
      lastError = error instanceof Error ? error.message.slice(0, 300) : 'parse error'
      continue
    }

    // Deterministische Nachverarbeitung: Regeln schlagen Modell-Feinheiten.
    let priority = parsed.priority
    const stats = db
      .prepare('SELECT sent_count FROM contact_stats WHERE account_id = ? AND addr = ?')
      .get(row.account_id, row.from_addr ?? '') as { sent_count: number } | undefined
    if (stats && stats.sent_count > 0) priority = Math.min(5, priority + 1)
    if (row.list_unsubscribe) priority = Math.max(1, priority - 1)

    const userAuthored = isUserAuthoredMail(db, row.from_addr, row.folder_special_use)
    const fullBodyText = row.text_plain?.trim() || htmlToText(row.html_raw ?? '')
    const forwardWithoutRequest = isForwardWithoutRequest(row.subject, fullBodyText)
    const suppressRequests = userAuthored || forwardWithoutRequest
    const actionItems = suppressRequests ? [] : parsed.action_items
    const needsReply = suppressRequests ? false : parsed.needs_reply

    db.prepare(
      `INSERT INTO ai_annotations (message_id, category, priority, summary, action_items_json,
         needs_reply, addressed_to_me, confidence, model, prompt_version, input_tokens,
         output_tokens, cost_usd, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(message_id) DO UPDATE SET
         category = excluded.category, priority = excluded.priority, summary = excluded.summary,
         action_items_json = excluded.action_items_json, needs_reply = excluded.needs_reply,
         addressed_to_me = excluded.addressed_to_me,
         confidence = excluded.confidence, model = excluded.model,
         prompt_version = excluded.prompt_version, input_tokens = excluded.input_tokens,
         output_tokens = excluded.output_tokens, cost_usd = excluded.cost_usd,
         created_at = excluded.created_at`
      // user_override_category bleibt beim Upsert unangetastet erhalten.
    ).run(
      messageId,
      parsed.category,
      priority,
      parsed.summary.slice(0, 200),
      JSON.stringify(actionItems),
      needsReply ? 1 : 0,
      parsed.addressed_to_me ? 1 : 0,
      parsed.confidence,
      model,
      PROMPT_VERSION,
      inputTokens,
      outputTokens,
      costUsd,
      Date.now()
    )

    createTasksFromTriage(db, {
      sourceKind: 'mail',
      sourceId: messageId,
      accountId: row.account_id,
      category: parsed.category,
      needsReply,
      subject: row.subject,
      actionItems,
      accountEmail: row.account_email,
      ownerDisplayName: row.account_display_name,
      ownerAccountName: row.account_name,
      toJson: row.to_json,
      ccJson: row.cc_json,
      bodyText: textBeforeForwardedMessage(row.subject, fullBodyText),
      addressedToMe: parsed.addressed_to_me,
      fromAddr: row.from_addr,
      folderSpecialUse: row.folder_special_use,
      forwardWithoutRequest
    })
    return 'done'
  }

  throw new Error(`Triage-Output ungültig nach Retry: ${lastError}`)
}
