import { describe, it, expect, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import {
  boundedLevenshtein,
  fuzzySenderMatches,
  fuzzySenderMessageIds,
  fuzzySenderThreadKeys
} from '@main/search/fuzzy-sender'
import { queryTerms } from '@main/search/semantic'
import { closeTestDb, createTestDb, seedAccount, seedFolder } from '../helpers/db'

// Typo-tolerant sender lookup (M92) — regression built from Tim's real case:
// "was ist die letzte mail von jens buetfisch" (missing "e") must still find
// "Bütefisch, Jens <jens.buetefisch@stadt.example>".

function seedSenderMail(
  db: Database.Database,
  opts: {
    accountId: number
    folderId: number
    uid: number
    threadKey: string
    fromName: string
    fromAddr: string
    date?: number
  }
): void {
  db.prepare(
    `INSERT INTO messages (account_id, folder_id, uid, message_id, thread_key, subject,
       from_addr, from_name, date, body_state)
     VALUES (?, ?, ?, ?, ?, 'Betreff', ?, ?, ?, 'full')`
  ).run(
    opts.accountId,
    opts.folderId,
    opts.uid,
    `<f${opts.uid}@t>`,
    opts.threadKey,
    opts.fromAddr,
    opts.fromName,
    opts.date ?? 1_700_000_000_000 + opts.uid
  )
}

describe('boundedLevenshtein', () => {
  it('measures edits and honors the bound', () => {
    expect(boundedLevenshtein('buetfisch', 'buetefisch', 2)).toBe(1)
    expect(boundedLevenshtein('jens', 'jens', 0)).toBe(0)
    expect(boundedLevenshtein('marie', 'maria', 1)).toBe(1)
    expect(boundedLevenshtein('kurz', 'komplettanders', 2)).toBe(3)
  })
})

describe('fuzzySenderMatches', () => {
  let db: Database.Database
  afterEach(() => closeTestDb(db))

  function seed(): { accountId: number; inbox: number } {
    db = createTestDb()
    const accountId = seedAccount(db, { email: 'tim@example.org' })
    const inbox = seedFolder(db, accountId, '\\Inbox')
    seedSenderMail(db, {
      accountId,
      folderId: inbox,
      uid: 1,
      threadKey: 'stadt',
      fromName: 'Bütefisch, Jens',
      fromAddr: 'Jens.Buetefisch@stadt.example',
      date: 1_784_000_000_000
    })
    seedSenderMail(db, {
      accountId,
      folderId: inbox,
      uid: 2,
      threadKey: 'stadt-alt',
      fromName: 'Bütefisch, Jens',
      fromAddr: 'Jens.Buetefisch@stadt.example',
      date: 1_700_000_000_000
    })
    seedSenderMail(db, {
      accountId,
      folderId: inbox,
      uid: 3,
      threadKey: 'noise',
      fromName: 'Newsletter',
      fromAddr: 'info@newsletter.example'
    })
    return { accountId, inbox }
  }

  it('findet den Absender trotz Tippfehler und Umlaut-Faltung', () => {
    seed()
    const terms = queryTerms('was ist die letzte mail von jens buetfisch')
    const matches = fuzzySenderMatches(db, terms)
    expect(matches.map((m) => m.addr)).toEqual(['jens.buetefisch@stadt.example'])
  })

  it('liefert die Threads des Absenders neueste zuerst', () => {
    seed()
    const terms = queryTerms('letzte mail von buetfisch')
    expect(fuzzySenderThreadKeys(db, terms, 5)).toEqual(['stadt', 'stadt-alt'])
    expect(fuzzySenderMessageIds(db, terms, 5)).toEqual([1, 2])
  })

  it('ignoriert generische Postfach-Wörter und Kurz-Terme', () => {
    seed()
    expect(fuzzySenderMatches(db, ['info'])).toEqual([])
    expect(fuzzySenderMatches(db, ['von'])).toEqual([])
  })
})
