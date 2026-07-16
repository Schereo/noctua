import { describe, it, expect } from 'vitest'
import { tokenizeWords } from '@renderer/lib/spell'

describe('tokenizeWords', () => {
  it('zerlegt deutschen Text mit Umlauten und liefert korrekte Offsets', () => {
    const text = 'Vögel wären übermorgen da'
    const tokens = tokenizeWords(text)
    expect(tokens.map((t) => t.word)).toEqual(['Vögel', 'wären', 'übermorgen', 'da'])
    for (const t of tokens) expect(text.slice(t.start, t.end)).toBe(t.word)
  })

  it('hält Bindestrich-Komposita als ein Token zusammen', () => {
    expect(tokenizeWords('E-Mail-Adresse prüfen').map((t) => t.word)).toEqual([
      'E-Mail-Adresse',
      'prüfen'
    ])
  })

  it('behält Apostroph-Wörter (gerade und typografisch)', () => {
    expect(tokenizeWords("geht's gut, don’t worry").map((t) => t.word)).toEqual([
      "geht's",
      'gut',
      'don’t',
      'worry'
    ])
  })

  it('nimmt Satzzeichen und Randbindestriche nicht ins Token', () => {
    expect(tokenizeWords('Hallo, Welt! So -toll- war das.').map((t) => t.word)).toEqual([
      'Hallo',
      'Welt',
      'So',
      'toll',
      'war',
      'das'
    ])
  })

  it('überspringt Mail-Adressen und URLs komplett', () => {
    const text =
      'Schreib an lena.hartmann@example.org oder siehe https://example.com/pfad und www.test.de danach'
    expect(tokenizeWords(text).map((t) => t.word)).toEqual([
      'Schreib',
      'an',
      'oder',
      'siehe',
      'und',
      'danach'
    ])
  })

  it('überspringt Einzelbuchstaben und Zahlen', () => {
    expect(tokenizeWords('v drücken und 3 Punkte').map((t) => t.word)).toEqual([
      'drücken',
      'und',
      'Punkte'
    ])
  })
})
