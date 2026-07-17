/* eslint-disable @typescript-eslint/explicit-function-return-type -- Eval-Tooling in .mjs */
import { spawn } from 'node:child_process'
import { MAILS, OWNER } from './dataset.mjs'

// Eval-Harness für die On-Device-Triage (M88): misst Prompt-/Pipeline-
// Varianten gegen die Gold-Labels in dataset.mjs. Nutzung:
//   pnpm run build:fm && node scripts/apple-triage-eval/run.mjs [v0|v5|alle]
// Die Prompts V0/GATE sind Kopien aus src/main/ai/triage.ts — bei Änderungen
// dort hier nachziehen und NEU MESSEN (drei Läufe, das Modell streut).
// V5 (Gate + Prod-Prompt) ist die produktive Pipeline: P100/R90 auf diesem Set.

const HELPER = new URL('../../native/fm-helper/bin/noctua-fm', import.meta.url).pathname

// V0 = exakter Produktions-Prompt aus src/main/ai/triage.ts
const PROMPT_V0 = `Du bist der Triage-Klassifikator eines persönlichen E-Mail-Clients.
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

// Gate-Prompt für die zweistufige Variante V2
const PROMPT_GATE = `Du prüfst für einen E-Mail-Client GENAU EINE Frage:
Bittet in dieser Mail ein einzelner Mensch den im EMPFÄNGER-Block genannten
Kontoinhaber PERSÖNLICH um etwas, existiert eine echte Frist für IHN
(zahlen, Formular abgeben, buchen), oder wartet der Absender erkennbar auf
eine persönliche Antwort des Kontoinhabers (z. B. eine direkte Frage an ihn)?

NEIN bei: Newslettern, Werbung (auch mit Frist „nur bis Sonntag"),
Benachrichtigungen von Diensten, Sicherheitshinweisen und Codes, Reports,
automatischen Erinnerungen, Rundmails mit Gruppenanrede, Mails deren Anrede
eine andere Person nennt, reinen Infos ohne Bitte.
Im Zweifel: NEIN.`

function userPrompt(mail) {
  const placementLabel = {
    to: 'steht im An',
    cc: 'steht nur im CC',
    absent: 'ist weder in An noch CC (Verteiler-/Bcc-Zustellung)'
  }[mail.placement]
  const salutationLabel = mail.salut.startsWith('named:')
    ? `nennt namentlich: ${mail.salut.slice(6)}`
    : mail.salut === 'group'
      ? 'Gruppenanrede (z. B. „Hallo zusammen")'
      : 'keine erkennbare Anrede'
  return [
    `Von: ${mail.from}`,
    `Betreff: ${mail.subject}`,
    `Datum: Do., 16.07.2026, 15:00`,
    `EMPFÄNGER (Kontoinhaber): ${OWNER}; ${placementLabel}; Anrede der Mail: ${salutationLabel}`,
    mail.unsub ? 'Signale: List-Unsubscribe-Header vorhanden (Massenmail-Signal)' : null,
    '',
    'Inhalt:',
    mail.body
  ]
    .filter((l) => l !== null)
    .join('\n')
}

// Prod-Code-Gates (createTasksFromTriage) nachgebildet
const TASK_CATEGORIES = new Set(['personal', 'work', 'transactional'])
const SECURITY_RE =
  /anmeldung|sicherheit|verifizierung|bestätigungscode|passwort|security|verification/i

const OWNER_TOKENS = new Set(['lena', 'hartmann'])
function salutationBlocks(mail) {
  if (!mail.salut.startsWith('named:')) return false
  const tokens = mail.salut
    .slice(6)
    .toLowerCase()
    .split(/[\s,.]+/)
    .filter(Boolean)
  return !tokens.some((t) => OWNER_TOKENS.has(t))
}

function predictedTaskMail(verdict, mail) {
  if (salutationBlocks(mail)) return false
  if (!TASK_CATEGORIES.has(verdict.category)) return false
  if (SECURITY_RE.test(mail.subject)) return false
  if (!verdict.addressed_to_me) return false
  const items = verdict.action_items ?? []
  const gated = verdict.is_personal_request === false ? [] : items
  return gated.length > 0 || verdict.needs_reply === true
}

class Helper {
  constructor() {
    this.proc = spawn(HELPER, ['serve'], { stdio: ['pipe', 'pipe', 'inherit'] })
    this.proc.stdout.setEncoding('utf8')
    this.buf = ''
    this.waiters = new Map()
    this.nextId = 1
    this.proc.stdout.on('data', (chunk) => {
      this.buf += chunk
      let i
      while ((i = this.buf.indexOf('\n')) >= 0) {
        const line = this.buf.slice(0, i).trim()
        this.buf = this.buf.slice(i + 1)
        if (!line) continue
        const msg = JSON.parse(line)
        const w = this.waiters.get(msg.id)
        if (w) {
          this.waiters.delete(msg.id)
          w(msg)
        }
      }
    })
  }
  ask(mode, instructions, prompt) {
    return new Promise((resolve) => {
      const id = this.nextId++
      this.waiters.set(id, resolve)
      this.proc.stdin.write(JSON.stringify({ id, mode, instructions, prompt }) + '\n')
    })
  }
  close() {
    this.proc.kill()
  }
}

function evaluate(results) {
  let tp = 0,
    fp = 0,
    fn = 0,
    tn = 0,
    catOk = 0,
    addrOk = 0,
    msSum = 0
  const errors = []
  for (const r of results) {
    msSum += r.ms
    const want = r.mail.gold.tasks
    const got = r.predicted
    if (want && got) tp++
    else if (!want && got) {
      fp++
      errors.push(
        `FP ${r.mail.id} (cat=${r.verdict.category}, addr=${r.verdict.addressed_to_me}, items=${(r.verdict.action_items ?? []).length}, reply=${r.verdict.needs_reply})`
      )
    } else if (want && !got) {
      fn++
      errors.push(
        `FN ${r.mail.id} (cat=${r.verdict.category}, addr=${r.verdict.addressed_to_me}, items=${(r.verdict.action_items ?? []).length}, reply=${r.verdict.needs_reply}, gate=${r.verdict.is_personal_request})`
      )
    } else tn++
    if (r.mail.gold.cats.includes(r.verdict.category)) catOk++
    if ((r.verdict.addressed_to_me === true) === r.mail.gold.addressed) addrOk++
  }
  const precision = tp + fp === 0 ? 1 : tp / (tp + fp)
  const recall = tp + fn === 0 ? 1 : tp / (tp + fn)
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall)
  return {
    tp,
    fp,
    fn,
    tn,
    precision,
    recall,
    f1,
    catAcc: catOk / results.length,
    addrAcc: addrOk / results.length,
    avgMs: Math.round(msSum / results.length),
    errors
  }
}

async function runVariant(helper, name, fn) {
  const results = []
  for (const mail of MAILS) {
    const r = await fn(mail)
    results.push(r)
  }
  const m = evaluate(results)
  console.log(`\n━━ ${name} ━━`)
  console.log(
    `  Aufgaben-Mails:  Precision ${(m.precision * 100).toFixed(0)}%  Recall ${(m.recall * 100).toFixed(0)}%  F1 ${(m.f1 * 100).toFixed(0)}%  (TP ${m.tp} FP ${m.fp} FN ${m.fn} TN ${m.tn})`
  )
  console.log(
    `  Kategorie-Acc:   ${(m.catAcc * 100).toFixed(0)}%   Adressat-Acc: ${(m.addrAcc * 100).toFixed(0)}%   Ø ${m.avgMs} ms/Mail`
  )
  for (const e of m.errors) console.log(`    ${e}`)
  return m
}

const variant = process.argv[2] ?? 'alle'
const helper = new Helper()

if (variant === 'alle' || variant === 'v0') {
  await runVariant(helper, 'V0 — Prod-Prompt, Prod-Schema', async (mail) => {
    const res = await helper.ask('triage', PROMPT_V0, userPrompt(mail))
    const verdict = res.ok
      ? res.result
      : { category: 'other', action_items: [], needs_reply: false, addressed_to_me: false }
    return { mail, verdict, ms: res.ms ?? 0, predicted: predictedTaskMail(verdict, mail) }
  })
}

if (variant === 'alle' || variant === 'v5') {
  await runVariant(helper, 'V5 — Gate-Frage + Prod-Prompt-Triage', async (mail) => {
    const gate = await helper.ask('gate', PROMPT_GATE, userPrompt(mail))
    const res = await helper.ask('triage', PROMPT_V0, userPrompt(mail))
    const verdict = res.ok
      ? res.result
      : { category: 'other', action_items: [], needs_reply: false, addressed_to_me: false }
    if (gate.ok && gate.result.is_personal_request === false) {
      verdict.action_items = []
      verdict.needs_reply = false
    }
    return {
      mail,
      verdict,
      ms: (res.ms ?? 0) + (gate.ms ?? 0),
      predicted: predictedTaskMail(verdict, mail)
    }
  })
}

// DeepSeek-Vergleich (Cloud-Pfad wie in prod: ein Aufruf, kein Gate).
// Braucht OPENROUTER_API_KEY in der Umgebung; kostet ~1–2 Cent pro Lauf.
async function askDeepseek(systemPrompt, prompt) {
  const started = Date.now()
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'deepseek/deepseek-v4-flash',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      // Hybrid-Reasoner: Denk-Tokens zählen mit — 500 schneidet Antworten ab
      max_tokens: 1200,
      usage: { include: true }
    })
  })
  const data = await response.json()
  const raw = data.choices?.[0]?.message?.content ?? '{}'
  let verdict
  try {
    verdict = JSON.parse(raw)
  } catch {
    verdict = { category: 'other', action_items: [], needs_reply: false, addressed_to_me: false }
  }
  return { verdict, ms: Date.now() - started, costUsd: data.usage?.cost ?? 0 }
}

if (variant === 'deepseek') {
  if (!process.env.OPENROUTER_API_KEY) {
    console.error('OPENROUTER_API_KEY fehlt — export OPENROUTER_API_KEY=sk-or-… und erneut starten')
    process.exit(1)
  }
  let cost = 0
  await runVariant(
    helper,
    'DeepSeek v4 Flash — Prod-Prompt, ein Aufruf (Cloud-Pfad)',
    async (mail) => {
      const { verdict, ms, costUsd } = await askDeepseek(PROMPT_V0, userPrompt(mail))
      cost += costUsd
      return { mail, verdict, ms, predicted: predictedTaskMail(verdict, mail) }
    }
  )
  console.log(`  Kosten gesamt: $${cost.toFixed(4)}`)
}

helper.close()
