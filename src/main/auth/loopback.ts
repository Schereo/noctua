import { createServer, type Server } from 'node:http'
import { AuthError } from '@azure/msal-node'
import type { AuthorizeResponse, ILoopbackClient } from '@azure/msal-node'

/**
 * Abbrechbarer Loopback-Server für den Microsoft-OAuth (Design 3b).
 *
 * msal-node bringt zwar einen eigenen LoopbackClient mit, bietet aber keinen
 * Weg, einen laufenden Login abzubrechen — der CANCEL-Knopf im Konten-Sheet
 * braucht genau das. Diese Implementierung spiegelt msals Verhalten
 * (Loopback auf 127.0.0.1, Redirect-URI http://localhost:{port}, Success-/
 * Error-Template) und ergänzt cancel(): Server zu, wartendes
 * listenForAuthCode-Promise verwirft — acquireTokenInteractive bricht damit
 * sauber ab.
 */
export class CancelableLoopbackClient implements ILoopbackClient {
  private server: Server | null = null
  private rejectListener: ((error: Error) => void) | null = null
  private canceled = false

  listenForAuthCode(successTemplate?: string, errorTemplate?: string): Promise<AuthorizeResponse> {
    if (this.server) {
      return Promise.reject(new Error('Loopback-Server läuft bereits'))
    }
    return new Promise<AuthorizeResponse>((resolve, reject) => {
      this.rejectListener = reject
      this.server = createServer((req, res) => {
        const url = req.url ?? ''
        if (url === '/') {
          // msal leitet nach erfolgreichem Code-Empfang auf "/" um, damit der
          // Auth-Code nicht in der Browser-History landet — hier kommt die
          // Erfolgsseite.
          res.end(successTemplate ?? 'Angemeldet. Dieses Fenster kann geschlossen werden.')
          return
        }
        const parsed = new URL(url, this.getRedirectUri())
        const response: AuthorizeResponse = {}
        for (const [key, value] of parsed.searchParams) {
          ;(response as Record<string, string>)[key] = value
        }
        if (response.code) {
          res.writeHead(302, { location: this.getRedirectUri() })
          res.end()
        } else {
          res.end(errorTemplate ?? `Anmeldung fehlgeschlagen: ${response.error ?? 'unbekannt'}`)
        }
        this.rejectListener = null
        resolve(response)
      })
      this.server.listen(0, '127.0.0.1')
    })
  }

  getRedirectUri(): string {
    if (this.canceled) {
      // Kein NodeAuthError „noLoopbackServerExists": msals Redirect-URI-Polling
      // würde damit weiterwarten — ein generischer Fehler bricht sofort ab.
      throw new Error('Anmeldung abgebrochen')
    }
    if (!this.server || !this.server.listening) {
      // Exakt msals Fehlertyp + -code, damit waitForRedirectUri weiter pollt,
      // bis der Server lauscht (Race zwischen listen() und getRedirectUri()).
      throw new AuthError('no_loopback_server_exists', 'Loopback-Server lauscht noch nicht')
    }
    const address = this.server.address()
    if (!address || typeof address === 'string') {
      throw new Error('Loopback-Adresse unbekannt')
    }
    return `http://localhost:${address.port}`
  }

  closeServer(): void {
    this.server?.close()
    this.server?.closeAllConnections()
    this.server = null
  }

  /** Bricht den wartenden Login ab — der Aufrufer bekommt `message` als Fehler. */
  cancel(message: string): void {
    this.canceled = true
    const reject = this.rejectListener
    this.rejectListener = null
    this.closeServer()
    reject?.(new Error(message))
  }
}
