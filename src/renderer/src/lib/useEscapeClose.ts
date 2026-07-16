import { useEffect } from 'react'

/**
 * Schließt ein Overlay per Escape. Capture-Phase + stopPropagation, damit
 * darunterliegende Escape-Handler (z. B. Auswahl-Reset der Inbox) nicht
 * mitfeuern, solange der Dialog offen ist.
 */
export function useEscapeClose(open: boolean, onClose: () => void): void {
  useEffect(() => {
    if (!open) return
    const handler = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      event.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', handler, { capture: true })
    return () => window.removeEventListener('keydown', handler, { capture: true })
  }, [open, onClose])
}
