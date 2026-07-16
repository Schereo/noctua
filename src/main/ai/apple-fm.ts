import { spawn, execFile, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'

/**
 * Brücke zu Apple Foundation Models (macOS 26+, Apple Silicon): spricht den
 * Swift-Helper `noctua-fm` (native/fm-helper) über ein JSON-Zeilenprotokoll.
 * Der Helper läuft als langlebiger Serve-Prozess; Anfragen sind seriell
 * (die AI-Queue arbeitet ohnehin eine Mail nach der anderen ab).
 */

export type AppleFmState =
  | 'available'
  | 'apple-intelligence-off'
  | 'model-not-ready'
  | 'device-unsupported'
  | 'helper-missing'
  | 'error'

export interface AppleFmStatus {
  state: AppleFmState
  detail: string | null
}

/** Guardrail-Ablehnungen bekommen eine eigene Fehlerklasse: die Triage
 *  schreibt dann ein neutrales Urteil statt den Job zu verbrennen. */
export class AppleGuardrailError extends Error {}

function helperPath(): string | null {
  const candidates = [
    join(process.resourcesPath ?? '', 'noctua-fm'),
    join(app.getAppPath(), 'native', 'fm-helper', 'bin', 'noctua-fm')
  ]
  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) return candidate
  }
  return null
}

function classifyReason(reason: string | undefined): AppleFmState {
  switch (reason) {
    case 'appleIntelligenceNotEnabled':
      return 'apple-intelligence-off'
    case 'modelNotReady':
      return 'model-not-ready'
    case 'deviceNotEligible':
      return 'device-unsupported'
    default:
      return 'error'
  }
}

let statusCache: { at: number; status: AppleFmStatus } | null = null

/** Verfügbarkeit des On-Device-Modells (60 s gecacht — der Settings-Refetch
 *  und jeder Triage-Lauf fragen sonst denselben Zustand ab). */
export async function appleFmStatus(force = false): Promise<AppleFmStatus> {
  if (!force && statusCache && Date.now() - statusCache.at < 60_000) return statusCache.status

  const status = await new Promise<AppleFmStatus>((resolve) => {
    if (process.platform !== 'darwin') {
      resolve({ state: 'device-unsupported', detail: 'nur macOS' })
      return
    }
    const binary = helperPath()
    if (!binary) {
      resolve({ state: 'helper-missing', detail: null })
      return
    }
    execFile(binary, ['check'], { timeout: 10_000 }, (error, stdout) => {
      if (error) {
        resolve({ state: 'error', detail: error.message.slice(0, 200) })
        return
      }
      try {
        const parsed = JSON.parse(stdout.trim()) as { state?: string; reason?: string }
        resolve(
          parsed.state === 'available'
            ? { state: 'available', detail: null }
            : { state: classifyReason(parsed.reason), detail: parsed.reason ?? null }
        )
      } catch {
        resolve({ state: 'error', detail: 'unlesbare Helper-Antwort' })
      }
    })
  })

  statusCache = { at: Date.now(), status }
  return status
}

interface Waiter {
  resolve: (result: unknown) => void
  reject: (error: Error) => void
  timer: NodeJS.Timeout
}

let proc: ChildProcessWithoutNullStreams | null = null
let nextId = 1
const waiters = new Map<number, Waiter>()
let stdoutRest = ''

function failAllWaiters(message: string): void {
  for (const [, waiter] of waiters) {
    clearTimeout(waiter.timer)
    waiter.reject(new Error(message))
  }
  waiters.clear()
}

function ensureServeProcess(binary: string): ChildProcessWithoutNullStreams {
  if (proc && proc.exitCode === null) return proc

  const child = spawn(binary, ['serve'], { stdio: ['pipe', 'pipe', 'pipe'] })
  stdoutRest = ''
  child.stdout.setEncoding('utf8')
  child.stdout.on('data', (chunk: string) => {
    stdoutRest += chunk
    let index: number
    while ((index = stdoutRest.indexOf('\n')) >= 0) {
      const line = stdoutRest.slice(0, index).trim()
      stdoutRest = stdoutRest.slice(index + 1)
      if (!line) continue
      try {
        const message = JSON.parse(line) as {
          id?: number
          ok?: boolean
          result?: unknown
          error?: string
          state?: string
        }
        const waiter = message.id !== undefined ? waiters.get(message.id) : undefined
        if (!waiter) continue
        waiters.delete(message.id!)
        clearTimeout(waiter.timer)
        if (message.ok && message.result !== undefined) waiter.resolve(message.result)
        else waiter.reject(new Error(message.error ?? message.state ?? 'Helper-Fehler'))
      } catch {
        // halbe Zeile o. Ä. — ignorieren, nächste Zeile trägt die Antwort
      }
    }
  })
  child.on('exit', (code) => {
    if (proc === child) proc = null
    failAllWaiters(`Helper beendet (Code ${code ?? 'Signal'})`)
  })
  child.on('error', (error) => {
    if (proc === child) proc = null
    failAllWaiters(`Helper-Start fehlgeschlagen: ${error.message}`)
  })

  proc = child
  return child
}

function requestOnce(binary: string, instructions: string, prompt: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const child = ensureServeProcess(binary)
    const id = nextId++
    const timer = setTimeout(() => {
      waiters.delete(id)
      reject(new Error('Zeitüberschreitung (60 s) — On-Device-Modell antwortet nicht'))
    }, 60_000)
    waiters.set(id, { resolve, reject, timer })
    child.stdin.write(JSON.stringify({ id, instructions, prompt }) + '\n', (error) => {
      if (error) {
        waiters.delete(id)
        clearTimeout(timer)
        reject(error)
      }
    })
  })
}

/**
 * Eine Triage-Anfrage ans On-Device-Modell. Wirft AppleGuardrailError bei
 * Inhalts-Ablehnung; bei gesprengtem Kontextfenster wird einmal mit
 * gekürztem Prompt wiederholt.
 */
export async function appleTriage(instructions: string, prompt: string): Promise<unknown> {
  const binary = helperPath()
  if (!binary) throw new Error('noctua-fm fehlt — pnpm run build:fm')

  try {
    return await requestOnce(binary, instructions, prompt)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/guardrail/i.test(message)) throw new AppleGuardrailError(message.slice(0, 200))
    if (/context/i.test(message)) {
      return await requestOnce(binary, instructions, prompt.slice(0, 6000))
    }
    throw error
  }
}

/** Beim App-Ende den Helper mitnehmen. */
export function stopAppleFm(): void {
  if (proc && proc.exitCode === null) proc.kill()
  proc = null
}
