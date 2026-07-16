import { describe, it, expect, afterEach, vi } from 'vitest'
import type Database from 'better-sqlite3'
import { runTriage } from '@main/ai/triage'
import { upsertEnvelope, storeBody } from '@main/mail/ingest'
import { countOpenTasks } from '@main/db/repos/tasks'
import { createTestDb, closeTestDb, seedAccount, seedFolder, makeEnvelope } from '../helpers/db'

// Apple-Provider (M87): Triage läuft on-device, aber die Aufgaben-Ableitung
// ist bewusst AUS — das kleine Modell erkennt zu viele Schein-Aufgaben.

const { fakeAppleTriage, fakeAppleStatus } = vi.hoisted(() => ({
  fakeAppleTriage: vi.fn(),
  fakeAppleStatus: vi.fn(async () => ({ state: 'available' as const, detail: null }))
}))

vi.mock('@main/ai/openrouter', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@main/ai/openrouter')>()
  return {
    ...actual,
    getTriageProvider: () => 'apple' as const,
    getOpenRouter: () => null
  }
})

vi.mock('@main/ai/apple-fm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@main/ai/apple-fm')>()
  return {
    ...actual,
    appleFmStatus: fakeAppleStatus,
    appleTriage: fakeAppleTriage
  }
})

function seedMail(db: Database.Database): number {
  const acc = seedAccount(db, { email: 'lena@test.de' })
  const folder = seedFolder(db, acc, '\\Inbox')
  const res = upsertEnvelope(
    db,
    acc,
    folder,
    makeEnvelope({
      uid: 991,
      messageId: '<apple-tasks-1@t>',
      subject: 'Newsletter Juli',
      to: [{ name: null, address: 'lena@test.de' }],
      cc: []
    })
  )!
  storeBody(db, res.messageId, {
    messageId: '<apple-tasks-1@t>',
    inReplyTo: null,
    references: [],
    subject: 'Newsletter Juli',
    from: { name: 'Verein', address: 'info@verein.example' },
    to: [],
    cc: [],
    replyTo: [],
    date: Date.now(),
    text: 'Hallo Lena, schau dir unbedingt unsere neuen Angebote an und melde dich bis Freitag!',
    html: null,
    snippet: 'Angebote',
    attachments: []
  })
  return res.messageId
}

describe('runTriage mit Apple-Provider', () => {
  let db: Database.Database

  afterEach(() => {
    closeTestDb(db)
    vi.clearAllMocks()
  })

  it('übernimmt das Urteil, legt aber keine Aufgaben an — auch bei übereifrigem Modell', async () => {
    db = createTestDb()
    const messageId = seedMail(db)

    // Übereifriges On-Device-Urteil: Schein-Aufgaben + needs_reply
    fakeAppleTriage.mockResolvedValueOnce({
      category: 'newsletter',
      priority: 3,
      summary: 'Verein bewirbt Angebote.',
      action_items: [
        { title: 'Angebote anschauen', due: null },
        { title: 'Bis Freitag melden', due: '2026-07-17' }
      ],
      needs_reply: true,
      addressed_to_me: true,
      confidence: 0.8
    })

    const outcome = await runTriage(db, messageId)
    expect(outcome).toBe('done')

    const annotation = db
      .prepare(
        'SELECT category, action_items_json, needs_reply, model, cost_usd FROM ai_annotations WHERE message_id = ?'
      )
      .get(messageId) as {
      category: string
      action_items_json: string
      needs_reply: number
      model: string
      cost_usd: number
    }
    // Urteil da, on-device, kostenlos — aber ohne abgeleitete Aufgaben
    expect(annotation.model).toBe('apple/on-device')
    expect(annotation.category).toBe('newsletter')
    expect(annotation.cost_usd).toBe(0)
    expect(JSON.parse(annotation.action_items_json)).toEqual([])
    expect(annotation.needs_reply).toBe(1)

    expect(countOpenTasks(db)).toBe(0)
    expect(db.prepare('SELECT count(*) n FROM tasks').get()).toEqual({ n: 0 })
  })

  it('legt den Job ohne verbrannten Versuch zurück, wenn das Modell nicht bereit ist', async () => {
    db = createTestDb()
    const messageId = seedMail(db)
    fakeAppleStatus.mockResolvedValueOnce({ state: 'model-not-ready' as const, detail: null })

    expect(await runTriage(db, messageId)).toBe('skipped-no-client')
    expect(fakeAppleTriage).not.toHaveBeenCalled()
  })
})
