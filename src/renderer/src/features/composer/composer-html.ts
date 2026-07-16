import DOMPurify from 'dompurify'
import { textToComposerHtml } from './composer-state'

export function sanitizeComposerHtml(html: string): string {
  return String(
    DOMPurify.sanitize(html, {
      ALLOWED_TAGS: ['div', 'p', 'br', 'b', 'strong', 'i', 'em', 'u', 'a', 'span', 'font'],
      ALLOWED_ATTR: ['href', 'target', 'rel', 'size', 'style']
    })
  )
}

/**
 * HTML-Alternative für den Versand. Fehlt echtes Editor-HTML (oder ist es nur
 * roher Text ohne Zeilen-Tags), wird der Klartext in <div>-Blöcke gewandelt —
 * sonst kollabieren die Zeilenumbrüche in HTML-Clients und der Gesendet-Ansicht.
 */
export function composerHtmlForSend(html: string, text: string): string {
  const trimmed = html.trim()
  const hasLineStructure = /<(div|p|br)\b/i.test(trimmed)
  return sanitizeComposerHtml(hasLineStructure ? html : textToComposerHtml(text))
}
