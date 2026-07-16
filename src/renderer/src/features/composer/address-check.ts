/**
 * Adress-Klassifizierung für die Empfänger-Chips (Design 3a).
 *
 * „ok": sieht nach einer vollständigen Adresse aus (@ mit Punkt in der Domain)
 * „doubtful": enthält ein @ mit etwas davor und dahinter, aber der Domain
 *             fehlt der Punkt — bleibt sendbar, wird aber im Akzent markiert
 * „invalid": alles andere — wird gar nicht erst zum Chip
 */
export type AddressQuality = 'ok' | 'doubtful' | 'invalid'

export function classifyAddress(raw: string): AddressQuality {
  const value = raw.trim()
  if (!value) return 'invalid'
  // Gleiche Heuristik wie das bisherige isAddress des Empfängerfelds
  if (/\S+@\S+\.\S+/.test(value)) return 'ok'
  if (/\S@\S/.test(value)) return 'doubtful'
  return 'invalid'
}

/** Darf ein Chip werden — vollständige UND zweifelhafte Adressen. */
export function isChippableAddress(raw: string): boolean {
  return classifyAddress(raw) !== 'invalid'
}

/** Zweifelhaft: @ vorhanden, aber kein Punkt in der Domain. */
export function isDoubtfulAddress(raw: string): boolean {
  return classifyAddress(raw) === 'doubtful'
}
