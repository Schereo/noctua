<div align="center">

<img src="resources/icon.png" alt="Noctua-Logo" width="128" />

# Noctua

**AI-first Mail-Client für macOS** — die Eule sortiert, du entscheidest.

[![CI](https://github.com/Schereo/noctua/actions/workflows/ci.yml/badge.svg)](https://github.com/Schereo/noctua/actions/workflows/ci.yml)
[![Version](https://img.shields.io/github/package-json/v/Schereo/noctua?label=version&color=c2452c)](CHANGELOG.md)
[![Plattform](https://img.shields.io/badge/macOS-Apple%20Silicon-17150f?logo=apple&logoColor=f4f1ea)](#loslegen)
[![Lizenz](https://img.shields.io/badge/lizenz-MIT-8a8069)](LICENSE)

</div>

Eingehende Mails werden lokal ausgewertet und per LLM kategorisiert,
priorisiert und zusammengefasst; Antworten entwirft die AI in deiner Stimme —
**gesendet wird immer von dir**. Local-first: Mails, Index und Schlüssel
bleiben auf deinem Rechner.

> Persönliches Projekt, gebaut für den Eigenbedarf und als Experiment, wie
> weit „AI-first" in einem Mail-Client tragen kann. Getestet auf macOS
> (Apple Silicon). Keine Gewährleistung — Issues und PRs sind willkommen.

## Was Noctua kann

- **Triage**: Kategorie, Priorität (1–5) und Ein-Satz-Zusammenfassung je
  Thread; „Braucht dich"-Filter fürs Wesentliche, Spam bleibt außen vor
- **Aufgaben aus Mails**: Die Eule schlägt Aufgaben mit Fälligkeit vor —
  annehmen oder verwerfen, manuell geht auch
- **Antworten diktieren** (⌘D): Stichpunkte einsprechen, die AI formuliert
  einen Entwurf im Stil deiner bisherigen Antworten (pro Konto gelernt)
- **Warten-Radar**: erkennt Threads, in denen du auf Antwort wartest, und
  entwirft Erinnerungs-Stupser — Versand erst nach deinem Ok
- **Suchen & Fragen**: Hybrid-Suche (Volltext + semantisch, lokal via FTS5 +
  sqlite-vec); die Eule beantwortet Fragen über dein Postfach mit Quellen
- **Tastatur-first**: j/k, Ordner-Tabs, Palette (⌘K), Undo (z) — Maus optional
- **Letterpress-UI**: ruhiges Papier-Design, Deutsch und Englisch

## Konten

| Provider              | Anbindung                 | Auth                                      |
| --------------------- | ------------------------- | ----------------------------------------- |
| Gmail                 | IMAP/SMTP                 | OAuth2 (Google-Login im Browser, XOAUTH2) |
| Outlook.com / Hotmail | IMAP/SMTP                 | OAuth2 (msal-node, XOAUTH2)               |
| Proton                | Proton Bridge (localhost) | Bridge-Passwort, TLS auf Loopback         |
| Beliebig              | IMAP/SMTP                 | Passwort/App-Passwort                     |

Für Google und Microsoft sind die öffentlichen Client-IDs von Thunderbird als
Default hinterlegt (übliche Praxis bei Open-Source-Mail-Clients, ein
„Geheimnis" gibt es bei Installed-App-OAuth nicht). Eigene Clients lassen sich
über die Einstellungen setzen (`google.clientId`/`google.clientSecret`,
`ms.clientId`).

## AI & Datenschutz

AI läuft über [OpenRouter](https://openrouter.ai) — **bring your own key**,
hinterlegt in Einstellungen → Intelligenz, gespeichert im macOS-Schlüsselbund
(safeStorage). Ein günstiges Modell übernimmt die Triage, ein starkes die
Antwortentwürfe; beide Modell-IDs sind frei konfigurierbar.

Es verlassen ausschließlich Mail-Texte für Triage/Entwürfe/Fragen den Rechner
(direkt zu OpenRouter, kein Zwischenserver). Ohne Key läuft Noctua als
gewöhnlicher Mail-Client weiter — nur die Eule schläft. Embeddings für die
semantische Suche werden lokal berechnet (transformers.js), Remote-Bilder in
Mails sind per Absender-Allowlist blockiert.

## Loslegen

Voraussetzungen: macOS, [Node.js](https://nodejs.org) ≥ 22,
[pnpm](https://pnpm.io) ≥ 9.

```bash
git clone https://github.com/Schereo/noctua.git
cd noctua
pnpm install        # Dependencies + Native-Rebuild (better-sqlite3)
pnpm dev            # App im Dev-Modus (HMR)
```

Danach in der App: Konto verbinden (Einstellungen → Konten), OpenRouter-Key
hinterlegen (Einstellungen → Intelligenz) — fertig.

```bash
pnpm typecheck      # TypeScript prüfen
pnpm test           # Test-Suite (Vitest)
pnpm coverage       # Test-Suite mit Coverage-Report
pnpm build:unpack   # Produktions-Build ohne DMG
pnpm build:mac      # DMG bauen
```

Das DMG ist nicht signiert/notarisiert (kein Apple-Developer-Account). Beim
ersten Start auf einem anderen Mac: Rechtsklick → Öffnen, oder
`xattr -d com.apple.quarantine /Applications/Noctua.app`.

**Dev vs. Prod-Daten:** Der Dev-Modus nutzt ein eigenes Datenverzeichnis
(`~/Library/Application Support/noctua`), die gebaute App ein separates
(`noctua-prod`) — beide können parallel laufen. `pnpm dev` startet unter
macOS eine gebrandete Electron-Hülle und signalisiert dem Main-Prozess mit
`NOCTUA_DEV=1`, dass er trotz `app.isPackaged` im Dev-Modus ist.

## Tests

Vitest deckt die korrektheits-kritische Kernlogik ab: Threading
(Betreff-Normalisierung, JWZ-light), MIME-Parsing, Ingest inkl. Gmail-Dedupe,
FTS-Suche, Regel-Matching, Budget-Mathematik, Outbox/Undo-Send, IPC-Contract
und alle Migrationen (In-Memory-DB). Electron wird in `test/setup.ts` gemockt.

**better-sqlite3-ABI:** Das native Modul ist ABI-gebunden — die App läuft
unter Electrons Node, Tests unter System-Node. `pnpm test` baut es automatisch
für Node, führt die Tests aus und stellt danach den Electron-Build wieder her.
Bricht ein Testlauf hart ab, repariert `pnpm run rebuild:electron` den
App-Build.

CI (`.github/workflows/ci.yml`) läuft Typecheck + Tests bei jedem Push und PR.

## Architektur

- **Main-Prozess**: IMAP-Sync (imapflow, IDLE + Poll), SQLite mit FTS5 und
  sqlite-vec (better-sqlite3), AI-Queue (OpenRouter), Credentials im
  safeStorage-Vault, SMTP (nodemailer) mit Outbox und Undo-Fenster
- **Renderer**: React 19, sandboxed ohne Node-Zugriff; Daten ausschließlich
  über den typisierten IPC-Vertrag (`src/shared/ipc-contract.ts`,
  zod-validiert)
- **Updates**: Die App prüft GitHub-Releases und zeigt einen Hinweis mit
  Download-Link — kein automatisches Installieren

## Bekannte Grenzen

- macOS-only (Fenster-Chrome, Schlüsselbund und Dev-Tooling sind darauf
  gebaut); Apple Silicon getestet
- Attachments laden den Mail-Source komplett; BODYSTRUCTURE-Part-Downloads
  sind der dokumentierte Optimierungspunkt
- Kein POP3, kein CalDAV/CardDAV — Noctua ist ein Mail-Client

## Lizenz

[MIT](LICENSE)
