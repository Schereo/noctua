import { useT } from '@renderer/lib/i18n'
import type { DictationState } from '@renderer/lib/useDictation'

/**
 * Kompakte Diktat-Statuszeile für Eingabefelder — nutzt bewusst die
 * Composer-Klassen (roter Punkt, Pegel, Stopp-Knopf), damit Einsprechen
 * überall gleich aussieht.
 */
export function DictationStrip({
  state,
  seconds,
  bars,
  onFinish
}: {
  state: DictationState
  seconds: number
  bars: number[]
  onFinish: () => void
}): React.JSX.Element | null {
  const t = useT()
  if (state === 'idle') return null

  if (state === 'transcribing') {
    return (
      <div className="mail-composer__status" role="status" aria-live="polite">
        <span className="mail-composer__status-label">{t('composerTranscribing')}</span>
      </div>
    )
  }

  const mm = String(Math.floor(seconds / 60)).padStart(2, '0')
  const ss = String(seconds % 60).padStart(2, '0')
  return (
    <div
      className="mail-composer__status mail-composer__status--recording"
      role="status"
      aria-live="polite"
    >
      <span className="mail-composer__live-dot" aria-hidden="true" />
      <span className="mail-composer__status-label">
        {t('composerListening')} {mm}:{ss}
      </span>
      <span className="mail-composer__meter" aria-hidden="true">
        {bars.map((height, index) => (
          <span
            key={index}
            className="mail-composer__meter-bar"
            style={{ height: Math.round(height) }}
          />
        ))}
      </span>
      <button type="button" onClick={onFinish} className="mail-composer__status-action">
        {t('composerStopRecording')}
      </button>
    </div>
  )
}
