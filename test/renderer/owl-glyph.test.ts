import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { OwlGlyph, owlTier } from '@renderer/components/paper/OwlGlyph'
import { railOwlPose } from '@renderer/features/paper/OwlRail'
import { showOwlEyes } from '@renderer/components/paper/Toast'

const render = (props: Parameters<typeof OwlGlyph>[0]): string =>
  renderToStaticMarkup(createElement(OwlGlyph, props))

describe('OwlGlyph — Posen und Größenstufen', () => {
  it('rendert alle fünf Posen mit Kopf, Schnabel und owl-glyph-Klasse', () => {
    for (const pose of ['awake', 'blink', 'asleep', 'scan', 'listen'] as const) {
      const svg = render({ pose })
      expect(svg).toContain('class="owl-glyph"')
      expect(svg).toContain('M2.5 2.2 6 4.6')
      expect(svg).toContain('m8.8 12 1.2 1 1.2-1')
      expect(svg).toContain('aria-hidden="true"')
    }
  })

  it('Augen unterscheiden die Posen (17px-Stufe aus den Specimens)', () => {
    expect(render({ pose: 'awake' })).toContain('r="1.7"')
    expect(render({ pose: 'scan' })).toContain('r="1.5"')
    expect(render({ pose: 'listen' })).toContain('r="2.1"')
    expect(render({ pose: 'asleep' })).toContain('q1.5 1.7 3 0')
    expect(render({ pose: 'blink' })).toContain('M5.5 8.6h3.2')
  })

  it('Strichstärken kommen aus dem Lookup, nicht aus einer Formel', () => {
    expect(owlTier(64).stroke).toBe(1.2)
    expect(owlTier(44).stroke).toBe(1.35)
    expect(owlTier(30).stroke).toBe(1.5)
    expect(owlTier(17).stroke).toBe(1.7)
    expect(owlTier(17).beak).toBe(1.5)
  })

  it('live erzeugt Animations-Styles nur für awake und scan', () => {
    const awakeLive = render({ pose: 'awake', live: true })
    expect(awakeLive).toContain('owl-pupil')
    expect(awakeLive).toContain('owl-lid')
    expect(render({ pose: 'scan', live: true })).toContain('owl-scan 3.6s')
    expect(render({ pose: 'listen', live: true })).not.toContain('animation')
    expect(render({ pose: 'awake' })).not.toContain('animation')
  })

  it('accentLeftEye färbt nur das linke Auge in Akzent', () => {
    const svg = render({ pose: 'awake', size: 44, accentLeftEye: true })
    expect(svg).toContain('fill="var(--ac)"')
    expect(svg).toContain('fill="var(--ink)"')
  })
})

describe('railOwlPose — Zustands-Mapping der Rail-Eule', () => {
  it('bildet Composer-Zustand und Schlüssel auf Posen ab', () => {
    expect(railOwlPose('listening', true)).toBe('listen')
    expect(railOwlPose('transcribing', true)).toBe('scan')
    expect(railOwlPose('drafting', true)).toBe('scan')
    expect(railOwlPose('idle', false)).toBe('asleep')
    expect(railOwlPose('idle', true)).toBe('awake')
    expect(railOwlPose('idle', undefined)).toBe('awake')
  })
})

describe('Toast — Augen bei Eulen-Ursprung', () => {
  const countdown = {
    until: Date.now() + 30_000,
    textFor: (s: number) => `${s}s`,
    doneText: 'ok'
  }

  it('owl:true zeigt Augen statt Quadrat', () => {
    expect(showOwlEyes({ owl: true })).toBe(true)
  })

  it('Countdown hat Vorrang: Rec-Punkt, nie Augen', () => {
    expect(showOwlEyes({ owl: true, countdown })).toBe(false)
  })

  it('ohne owl bleibt das Quadrat', () => {
    expect(showOwlEyes({})).toBe(false)
    expect(showOwlEyes({ countdown })).toBe(false)
  })
})
