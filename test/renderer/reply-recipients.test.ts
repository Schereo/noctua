import { describe, it, expect } from 'vitest'
import {
  buildReplyRecipients,
  mergeRecipientFields,
  type ReplyMessage
} from '@renderer/lib/reply-recipients'

// M80: Empfänger-Berechnung für r (Absender) und a (alle). Die eigenen
// Adressen kommen aus accounts:list — der Nutzer kann mehrere Konten haben.

const ME = 'tim@noctua.test'
const ME2 = 'tim@zweitkonto.test'

let seq = 0
function msg(over: Partial<ReplyMessage>): ReplyMessage {
  seq += 1
  return {
    id: seq,
    fromAddr: 'alice@firma.test',
    to: [{ name: null, address: ME }],
    cc: [],
    replyTo: [],
    subject: 'Projekt',
    ...over
  }
}

describe('buildReplyRecipients — Absender (r)', () => {
  it('antwortet an den From der letzten fremden Nachricht, CC bleibt leer', () => {
    const result = buildReplyRecipients([msg({})], [ME], 'sender')
    expect(result).toMatchObject({ to: ['alice@firma.test'], cc: [] })
  })

  it('respektiert den Reply-To-Header statt From', () => {
    const result = buildReplyRecipients(
      [msg({ replyTo: [{ name: 'Alice Antworten', address: 'antworten@firma.test' }] })],
      [ME],
      'sender'
    )
    expect(result?.to).toEqual(['antworten@firma.test'])
    expect(result?.cc).toEqual([])
  })

  it('fällt bei leerem Reply-To auf From zurück', () => {
    const result = buildReplyRecipients([msg({ replyTo: [] })], [ME], 'sender')
    expect(result?.to).toEqual(['alice@firma.test'])
  })

  it('überspringt eigene Nachrichten am Thread-Ende (alle eigenen Konten)', () => {
    const thread = [
      msg({ fromAddr: 'alice@firma.test' }),
      msg({ fromAddr: ME }),
      msg({ fromAddr: ME2 })
    ]
    const result = buildReplyRecipients(thread, [ME, ME2], 'sender')
    expect(result?.to).toEqual(['alice@firma.test'])
    // Antwort hängt threading-technisch an der letzten Nachricht des Threads
    expect(result?.replyToMessageId).toBe(thread[2].id)
  })

  it('normalisiert Re:/AW:-Präfixe im Betreff', () => {
    expect(buildReplyRecipients([msg({ subject: 'Re: Projekt' })], [ME], 'sender')?.subject).toBe(
      'Re: Projekt'
    )
    expect(buildReplyRecipients([msg({ subject: 'AW: Projekt' })], [ME], 'sender')?.subject).toBe(
      'Re: Projekt'
    )
  })

  it('liefert null für leere Threads', () => {
    expect(buildReplyRecipients([], [ME], 'sender')).toBeNull()
    expect(buildReplyRecipients([], [ME], 'all')).toBeNull()
  })
})

describe('buildReplyRecipients — Alle (a)', () => {
  it('setzt die übrigen An-/CC-Empfänger ins CC, ohne eigene Adressen', () => {
    const thread = [
      msg({
        fromAddr: 'alice@firma.test',
        to: [
          { name: null, address: ME },
          { name: 'Carol', address: 'carol@firma.test' }
        ],
        cc: [{ name: 'Dan', address: 'dan@firma.test' }]
      })
    ]
    const result = buildReplyRecipients(thread, [ME], 'all')
    expect(result?.to).toEqual(['alice@firma.test'])
    expect(result?.cc).toEqual(['carol@firma.test', 'dan@firma.test'])
  })

  it('filtert ALLE eigenen Konten aus dem CC (accounts:list)', () => {
    const thread = [
      msg({
        to: [
          { name: null, address: ME },
          { name: null, address: ME2.toUpperCase() },
          { name: null, address: 'carol@firma.test' }
        ]
      })
    ]
    const result = buildReplyRecipients(thread, [ME, ME2], 'all')
    expect(result?.cc).toEqual(['carol@firma.test'])
  })

  it('dedupliziert case-insensitiv und hält AN aus dem CC heraus', () => {
    const thread = [
      msg({
        fromAddr: 'alice@firma.test',
        to: [
          { name: null, address: 'Carol@Firma.test' },
          { name: null, address: 'alice@firma.test' }
        ],
        cc: [
          { name: null, address: 'carol@firma.test' },
          { name: null, address: 'dan@firma.test' }
        ]
      })
    ]
    const result = buildReplyRecipients(thread, [ME], 'all')
    expect(result?.to).toEqual(['alice@firma.test'])
    expect(result?.cc).toEqual(['Carol@Firma.test', 'dan@firma.test'])
  })

  it('kombiniert Reply-To als AN mit den übrigen Empfängern im CC', () => {
    const thread = [
      msg({
        fromAddr: 'alice@firma.test',
        replyTo: [{ name: null, address: 'antworten@firma.test' }],
        to: [
          { name: null, address: ME },
          { name: null, address: 'carol@firma.test' }
        ],
        cc: [{ name: null, address: 'dan@firma.test' }]
      })
    ]
    const result = buildReplyRecipients(thread, [ME], 'all')
    expect(result?.to).toEqual(['antworten@firma.test'])
    expect(result?.cc).toEqual(['carol@firma.test', 'dan@firma.test'])
  })

  it('richtet sich nach der letzten fremden Nachricht, nicht der ersten', () => {
    const thread = [
      msg({
        fromAddr: 'alice@firma.test',
        to: [{ name: null, address: ME }],
        cc: [{ name: null, address: 'dan@firma.test' }]
      }),
      msg({
        fromAddr: 'carol@firma.test',
        to: [
          { name: null, address: ME },
          { name: null, address: 'erik@firma.test' }
        ],
        cc: []
      }),
      msg({ fromAddr: ME, to: [{ name: null, address: 'carol@firma.test' }] })
    ]
    const result = buildReplyRecipients(thread, [ME], 'all')
    expect(result?.to).toEqual(['carol@firma.test'])
    expect(result?.cc).toEqual(['erik@firma.test'])
  })

  it('mehrere Reply-To-Adressen landen alle im AN', () => {
    const thread = [
      msg({
        replyTo: [
          { name: null, address: 'a@firma.test' },
          { name: null, address: 'b@firma.test' }
        ],
        to: [{ name: null, address: ME }],
        cc: [{ name: null, address: 'a@firma.test' }]
      })
    ]
    const result = buildReplyRecipients(thread, [ME], 'all')
    expect(result?.to).toEqual(['a@firma.test', 'b@firma.test'])
    // a@ ist schon AN — taucht nicht zusätzlich im CC auf
    expect(result?.cc).toEqual([])
  })

  it('Thread nur aus eigenen Nachrichten: Antwort an sich selbst, CC ohne eigene', () => {
    const thread = [
      msg({
        fromAddr: ME,
        to: [{ name: null, address: 'carol@firma.test' }],
        cc: []
      })
    ]
    const result = buildReplyRecipients(thread, [ME], 'all')
    expect(result?.to).toEqual([ME])
    expect(result?.cc).toEqual(['carol@firma.test'])
  })
})

describe('mergeRecipientFields (M90 — extra reply recipients)', () => {
  it('keeps each address in exactly one field, to beats cc beats bcc', () => {
    expect(
      mergeRecipientFields({
        to: ['neele@example.eu', 'extra@example.org'],
        cc: ['Extra@Example.org', 'cc@example.org', 'neele@example.eu'],
        bcc: ['cc@example.org', 'bcc@example.org']
      })
    ).toEqual({
      to: ['neele@example.eu', 'extra@example.org'],
      cc: ['cc@example.org'],
      bcc: ['bcc@example.org']
    })
  })

  it('drops blanks and trims before comparing', () => {
    expect(mergeRecipientFields({ to: ['  a@b.de  ', ''], cc: ['a@b.de'], bcc: [' '] })).toEqual({
      to: ['  a@b.de  '],
      cc: [],
      bcc: []
    })
  })
})
