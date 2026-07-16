import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Baut den Apple-Foundation-Models-Helper (native/fm-helper). Best effort:
// ohne Swift-Toolchain oder macOS-26-SDK wird still übersprungen — die App
// meldet den fehlenden Helper dann sauber in den Einstellungen.

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const source = join(root, 'native', 'fm-helper', 'main.swift')
const binDir = join(root, 'native', 'fm-helper', 'bin')
const binary = join(binDir, 'noctua-fm')

/** @returns {boolean} true, wenn der Helper vorhanden/gebaut ist */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- .mjs ohne TS-Syntax
export function buildFmHelper({ log = console.log } = {}) {
  if (process.platform !== 'darwin') return false
  if (!existsSync(source)) return false
  if (existsSync(binary) && statSync(binary).mtimeMs >= statSync(source).mtimeMs) return true

  try {
    const sdkVersion = execFileSync('xcrun', ['--show-sdk-version'], { encoding: 'utf8' }).trim()
    if (Number.parseInt(sdkVersion, 10) < 26) {
      log(`[fm-helper] macOS-SDK ${sdkVersion} < 26 — Helper wird übersprungen`)
      return false
    }
    mkdirSync(binDir, { recursive: true })
    execFileSync('swiftc', ['-parse-as-library', '-O', source, '-o', binary], {
      stdio: ['ignore', 'inherit', 'inherit']
    })
    log('[fm-helper] gebaut: native/fm-helper/bin/noctua-fm')
    return true
  } catch (error) {
    log(`[fm-helper] Bau übersprungen: ${error?.message ?? error}`)
    return false
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const ok = buildFmHelper()
  if (process.argv.includes('--strict') && !ok) process.exit(1)
}
