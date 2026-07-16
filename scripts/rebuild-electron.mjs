/**
 * Kompiliert better-sqlite3 aus dem Quellcode gegen die installierte
 * Electron-Version (ABI-gebunden, NAN-basiert). Zuverlässiger als
 * `electron-builder install-app-deps`, das gecachte Node-Prebuilds serviert
 * und dabei den falschen ABI liefern kann. Versions-agnostisch.
 */
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { rmSync } from 'node:fs'

const rootRequire = createRequire(join(process.cwd(), 'package.json'))
const bs3Pkg = rootRequire.resolve('better-sqlite3/package.json')
const bs3 = dirname(bs3Pkg)
// node-gyp ist eine Abhängigkeit von better-sqlite3, nicht des Projekts →
// aus dessen Require-Kontext auflösen (pnpm-strict).
const bs3Require = createRequire(bs3Pkg)
const nodeGyp = bs3Require.resolve('node-gyp/bin/node-gyp.js')
const electronVersion = rootRequire('electron/package.json').version

rmSync(join(bs3, 'build'), { recursive: true, force: true })
console.log(`[rebuild-electron] better-sqlite3 → Electron ${electronVersion} (${process.arch})`)
execFileSync(
  process.execPath,
  [
    nodeGyp,
    'rebuild',
    '--runtime=electron',
    `--target=${electronVersion}`,
    '--dist-url=https://electronjs.org/headers',
    `--arch=${process.arch}`
  ],
  { cwd: bs3, stdio: 'inherit' }
)
