#!/bin/zsh
# Sauberer Dev-(Neu-)Start: beendet ALLE Projekt-Instanzen (electron-vite,
# Electron-Binary dieses Repos, verwaiste Renderer-Ports), dann startet dev.
# Verhindert die Zombie-Fenster-Sammlung bei häufigen Neustarts.
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

pkill -f "electron-vite.*(dev|preview)" 2>/dev/null
pkill -f "$ROOT/scripts/dev.mjs" 2>/dev/null
# pnpm legt das Electron-Binary unter node_modules/.pnpm/… ab — Muster muss
# beide Layouts treffen, sonst ueberleben Instanzen (drei Zombies am 07.07.).
pkill -f "$ROOT/node_modules/.*Electron.app/Contents/MacOS/Electron" 2>/dev/null
pkill -f "$ROOT/node_modules/.cache/noctua-dev/Noctua.app/Contents/MacOS/Noctua" 2>/dev/null
for port in 5173 5174 5175 5176 5177; do
  lsof -ti ":$port" 2>/dev/null | xargs kill 2>/dev/null
done
sleep 1
# Nachzügler hart beenden
pkill -9 -f "$ROOT/node_modules/.*Electron.app/Contents/MacOS/Electron" 2>/dev/null
pkill -9 -f "$ROOT/node_modules/.cache/noctua-dev/Noctua.app/Contents/MacOS/Noctua" 2>/dev/null
sleep 0.5

exec pnpm --dir "$ROOT" dev "$@"
