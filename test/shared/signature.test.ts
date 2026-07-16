import { describe, expect, it } from 'vitest'
import {
  appendSignatureText,
  fitSignatureImage,
  renderSignatureText,
  signatureImageBackground,
  stripRedundantSignatureTail
} from '@shared/signature'

describe('fitSignatureImage', () => {
  it('passt ein breites Logo ohne Zuschnitt ein', () => {
    expect(fitSignatureImage(512, 160, 'rect')).toEqual({
      width: 180,
      height: 56,
      padding: 0,
      objectFit: 'contain'
    })
  })

  it('begrenzt Hochformate an der maximalen Höhe', () => {
    expect(fitSignatureImage(120, 400, 'rounded')).toEqual({
      width: 24,
      height: 80,
      padding: 0,
      objectFit: 'contain'
    })
  })

  it('vergrößert kleine Bilder nicht', () => {
    expect(fitSignatureImage(100, 40, 'rect')).toEqual({
      width: 100,
      height: 40,
      padding: 0,
      objectFit: 'contain'
    })
  })

  it('schneidet nur die Kreisform bewusst quadratisch zu', () => {
    expect(fitSignatureImage(500, 200, 'circle')).toEqual({
      width: 64,
      height: 64,
      padding: 0,
      objectFit: 'cover'
    })
  })

  it('zieht Innenabstand von der maximalen Bildfläche ab', () => {
    expect(fitSignatureImage(512, 160, 'rounded', 8)).toEqual({
      width: 180,
      height: 67,
      padding: 8,
      objectFit: 'contain'
    })
  })
})

describe('signatureImageBackground', () => {
  it('ist fuer alte und explizit transparente Signaturen transparent', () => {
    expect(signatureImageBackground(undefined)).toBe('transparent')
    expect(signatureImageBackground(null)).toBe('transparent')
  })

  it('uebernimmt nur sichere Hex-Farben', () => {
    expect(signatureImageBackground('#F4F1EA')).toBe('#F4F1EA')
    expect(signatureImageBackground('red;display:none')).toBe('transparent')
  })
})

describe('renderSignatureText', () => {
  it('übernimmt Reihenfolge und Textwerte der aktuellen Konfiguration', () => {
    expect(
      renderSignatureText({
        blocks: ['name', 'studio', 'rule', 'website'],
        values: {
          name: 'Lena Hartmann',
          studio: 'Studio Fernweh',
          website: 'example.eu'
        }
      })
    ).toBe('Lena Hartmann\nStudio Fernweh\n—\nexample.eu')
  })
})

describe('appendSignatureText', () => {
  it('trennt Mailtext und Signatur durch eine Leerzeile', () => {
    expect(appendSignatureText('Hallo Nele,\n\nbis bald.  ', 'Viele Grüße\nTim')).toBe(
      'Hallo Nele,\n\nbis bald.\n\nViele Grüße\nTim'
    )
  })

  it('liefert bei leerem Mailtext nur die Signatur', () => {
    expect(appendSignatureText('  ', '  Lena Hartmann  ')).toBe('Lena Hartmann')
  })

  it('haengt eine bereits vorhandene Signatur nicht erneut an', () => {
    const signature = 'Viele Gruesse\nLena Hartmann'
    const body = `Hallo Nele,\n\nbis bald.\n\n${signature}`

    expect(appendSignatureText(body, signature)).toBe(body)
    expect(appendSignatureText(appendSignatureText(body, signature), signature)).toBe(body)
  })

  it('laesst einen Inhalt unveraendert, der nur aus der Signatur besteht', () => {
    const signature = 'Lena Hartmann\nStudio Fernweh'
    expect(appendSignatureText(signature, signature)).toBe(signature)
  })
})

describe('stripRedundantSignatureTail', () => {
  const signature =
    'Lena Hartmann\nVolt Oldenburg / Volt Niedersachsen / Volt Deutschland\n—\nCity Lead Oldenburg'

  it('entfernt Grußformel, Namen und Funktionszeile aus einem KI-Entwurf', () => {
    expect(
      stripRedundantSignatureTail(
        'Moin,\n\nkurzer Test, ob alles läuft.\n\nDanke dir.\n\nViele Grüße\n\nTim\n\n— City Lead Oldenburg',
        signature
      )
    ).toBe('Moin,\n\nkurzer Test, ob alles läuft.\n\nDanke dir.')
  })

  it('entfernt wiederholte Signaturzeilen auch ohne Grußformel', () => {
    expect(stripRedundantSignatureTail('Hallo,\n\nbis morgen.\n\nLena Hartmann', signature)).toBe(
      'Hallo,\n\nbis morgen.'
    )
  })

  it('lässt den inhaltlichen Mailtext unverändert', () => {
    const body = 'Hallo,\n\ndanke für deine Nachricht. Ich melde mich morgen bei Tim.'
    expect(stripRedundantSignatureTail(body, signature)).toBe(body)
  })
})
