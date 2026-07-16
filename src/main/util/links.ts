import { shell } from 'electron'

const ALLOWED_EXTERNAL_SCHEMES = new Set(['https:', 'mailto:'])

/** Öffnet URLs nur mit erlaubtem Schema im System-Browser. */
export function openExternalSafe(url: string): boolean {
  try {
    if (ALLOWED_EXTERNAL_SCHEMES.has(new URL(url).protocol)) {
      void shell.openExternal(url)
      return true
    }
  } catch {
    // ungültige URL
  }
  return false
}
