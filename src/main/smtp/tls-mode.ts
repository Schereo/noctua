import { connect } from 'node:net'

/**
 * Implizites TLS oder STARTTLS? Auf Loopback (Proton Bridge) ist die
 * Betriebsart pro Protokoll konfigurierbar und am Port nicht ablesbar —
 * Tims Bridge z. B. fährt SMTP als „SSL" auf 1025. Die Unterscheidung ist
 * zum Glück deterministisch: Im Klartext-/STARTTLS-Modus schickt der Server
 * sofort seine 220-Begrüßung, im SSL-Modus wartet er stumm auf den
 * TLS-Handshake des Clients.
 */

// Erkannte Betriebsart je Ziel — die Bridge-Einstellung ändert sich selten.
// Nach einem Sendefehler wird der Eintrag verworfen und neu erkannt.
const detectedModes = new Map<string, boolean>()

export async function detectImplicitTls(
  host: string,
  port: number,
  timeoutMs = 700
): Promise<boolean> {
  const key = `${host}:${port}`
  const cached = detectedModes.get(key)
  if (cached !== undefined) return cached

  const result = await new Promise<{ implicitTls: boolean; cache: boolean }>((resolve) => {
    const socket = connect({ host, port })
    const finish = (implicitTls: boolean, cache: boolean): void => {
      clearTimeout(timer)
      socket.destroy()
      resolve({ implicitTls, cache })
    }
    // Stumm bis zum Timeout → Server erwartet den TLS-Handshake zuerst
    const timer = setTimeout(() => finish(true, true), timeoutMs)
    socket.once('data', () => finish(false, true))
    // Verbindungsfehler sagt nichts über die Betriebsart — nicht cachen,
    // der eigentliche Versand liefert die verständliche Fehlermeldung.
    socket.once('error', () => finish(false, false))
  })

  if (result.cache) detectedModes.set(key, result.implicitTls)
  return result.implicitTls
}

/** Nach einem Sendefehler aufrufen — der nächste Versuch erkennt neu. */
export function forgetTlsMode(host: string, port: number): void {
  detectedModes.delete(`${host}:${port}`)
}
