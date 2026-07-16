# Handoff: Noctua Mail — AI-first mail client (macOS · Electron)

## Overview
Noctua is a keyboard-first, AI-assisted mail client for macOS. The AI ("the owl") summarizes every thread, extracts tasks, counts the days since someone owed you a reply, drafts responses from dictation, and writes in a per-address style learned from the user's sent mail. Users bring their own OpenRouter key and choose which models handle inbox scanning vs. writing.

**This design replaces the app's previous UI entirely. Delete the old design; do not merge or blend. The files in this bundle are the sole source of truth for look, copy, and behavior.**

## About the Design Files
The two `.dc.html` files are **high-fidelity design references built in HTML** — open them directly in a browser; they are fully interactive prototypes. They are *not* production code to copy in. Recreate them in the Electron renderer using the codebase's established patterns (React or whatever the renderer uses).

Because Electron renders in Chromium, all CSS values here (fonts, hex colors, shadows, sizes) transfer 1:1.

File anatomy: the top of each file is the markup (inline styles everywhere; `{{ holes }}` are template bindings), the `<script>` class at the bottom (`class Component`) holds all state, data, timings, and keyboard handling. Read the class as the **behavior spec**.

## Fidelity
**High-fidelity.** Recreate pixel-perfectly: exact colors, type, spacing, borders, shadows, and copy. All interactions in the prototype are functional but *simulated* (canned data and timers) — see "Real integrations" below for what to wire up for real.

## Files
- `Noctua Mail.dc.html` — English. **Canonical reference.**
- `Noctua Mail DE.dc.html` — German. Identical layout and logic; use it as the authoritative German string table.

## Design Tokens

### Colors
| Token | Hex | Use |
|---|---|---|
| paper | `#F4F1EA` | app background |
| sheet | `#FDFCF8` | reading sheet, cards, selected rows |
| card-tint | `#F9F7F1` | inset cards/forms |
| rail | `#EFEBE2` | owl rail background |
| ink | `#17150F` | text, structural 1px borders, filled buttons, dark strips |
| body-text | `#26221a` | long-form mail body |
| secondary | `#57503f` | gists, asides (usually italic serif) |
| muted | `#6E6759` | mono meta text |
| faint | `#9a9184` | disabled/footnotes |
| hairline | `#DAD4C6` | secondary borders, row dividers |
| hairline-light | `#EAE5D9` | subtle dividers, progress track |
| highlight | `#F0E7D8` | inline text highlight |
| accent | `#C2452C` | unread marks, due chips, owl labels, waiting counts. Exposed as CSS var `--ac`; alternates offered: `#2A5A8C`, `#3F6B4F`, `#8A5A2A` |
| on-ink muted | `#b5afa3` | dim text on ink strips |

### Typography
- **Newsreader** (serif) — all reading text and UI names. Masthead wordmark: italic 500/24px. Sheet titles: 500/21px. Row names: 13.5px (600 unread, 400 read). Body: 14px/1.7. Gists/asides: italic. Drafts: 14.5px/1.7.
- **IBM Plex Mono** — all meta/labels/keys. Section labels: 500 8.5px, letter-spacing 1.5px, UPPERCASE. Meta lines: 9.5px. Chips: 500 8.5px, letter-spacing 1px. Kbd hints: bordered 1px `#DAD4C6`, padding 1px 6px.
- Both fonts are SIL OFL — **bundle the font files locally** in the app; do not fetch Google Fonts at runtime.

### Shape & shadow
- **Border radius: 0 everywhere.** The only circles are the rec dot, toggle dots, and onboarding owl-eye dots.
- Structural borders 1px ink; secondary 1px hairline; double rule = two 1px ink lines 2px apart (separates mail from composer).
- Offset "letterpress" shadows, never blurred: sheet `6px 6px 0 rgba(23,21,15,.1)`, cards `3px 3px 0 rgba(23,21,15,.08)`, overlays `8px 8px 0 rgba(23,21,15,.18)`, onboarding card `8px 8px 0 rgba(23,21,15,.1)`.
- Overlay scrim: `rgba(23,21,15,.28)`.

### Layout
- App min-width **1180px** (enforce as Electron min window width; suggested min height 760).
- Masthead ≈53px, 1px ink bottom border. Left pane fixed **400px**, 1px ink right border. Owl rail fixed **290px**, 1px ink left border. Center sheet flexes, padding 18px 20px around the sheet card.
- List rows: padding 10–11px 18px, 1px hairline bottom; selected = 3px ink left bar + sheet background.

## Screens / Views

### 1. Onboarding (first run)
Centered 620px sheet card on paper. Three steps, Enter advances:
1. **Welcome** — owl mark (40px square outline, two dots: accent + ink), italic wordmark 34px, tagline `MAIL, WITH AN OWL ON YOUR SHOULDER`, one paragraph, CTA `CONNECT YOUR MAIL — ↵` (ink button) + `skip for now`.
2. **Connect addresses** — 3 provider rows (Google / Outlook‑Hotmail / IMAP) each with glyph square, name, address, `CONNECT` button → `···` connecting → `CONNECTED` + `✓ n threads`. Continue enabled once ≥1 connected. Footnote: "nothing leaves your machine".
3. **Style training** — per-address progress bars (accent fill on `#EAE5D9` track) that fill sequentially; traits appear at 100% ("warm · brief · em-dashes · EN/DE" etc.). CTA `ENTER YOUR MAIL — ↵` enabled when all done.

Completion persists (prototype uses localStorage key `noctua_onboarded`; in Electron use your settings store). Palette has "Replay onboarding".

### 2. Main frame
Masthead: italic wordmark · mono date line `TUE, 7 JULY 2026 · WRITING AS <address>` (address follows the selected thread's account) · account filter chips `ALL / FERNWEH¹ / HOTMAIL² / NACHTVOGEL³` (active = inverted ink) · right-aligned nav `INBOX n ⌘1 · WAITING n ⌘2 · TASKS n ⌘3 · SETTINGS ⌘,` (active = 600 weight + 2px accent underline) · `⌘K` chip.
Left pane bottom: key strip `j/k move · e file · v dictate · g go… · ? keys` + transient g-hint in accent.

### 3. Inbox list ("Correspondence")
Header row: `CORRESPONDENCE` / `↳ = THE OWL'S GIST`. Each row:
- **Account badge** 13px square before the name: `F` ink-filled = fernweh (work), `H` ink-outlined = hotmail (personal), `N` accent-filled = nachtvogel (side project).
- Name · unread 6px accent square · time (mono, right).
- Gist line: `↳ <one-line AI summary>` italic secondary.
- Chips row when present: `TASK · FRI` (ink-filled) and `DRAFT READY` (accent outline).
- Archive animation: row collapses via max-height+opacity, ~240ms ease.
- Empty state: "Inbox zero." / `THE OWL APPROVES · Z TO UNDO`.

### 4. Reading sheet + composer (the hero surface)
Sheet card: subject 21px, mono meta caps (`FROM ‹addr› → account · time`), serif body where the key ask carries a **2px accent underline**.
- **Task strip** (when the owl found a task): `THE OWL FOUND A TASK · ☐ label · DUE chip · T ADD · X`. Accepted state: `✓ IN YOUR TASKS`.
- **Double rule**, then composer states:
  - *Idle*: dashed-border hint — "Press **v** and just talk… Or **r** to write yourself."
  - *Listening*: ink strip; accent rec dot; `LISTENING mm:ss`; 14 waveform bars (3px wide, heights 4–20px, re-randomized every 110ms, peaks in accent); transcript types in word-by-word (150ms/word) in mono with block cursor; `↵ done · ESC cancel`. Auto-finishes after the last word.
  - *Drafting*: owl chip + "The owl is drafting…" (animated dots, 320ms) + `voice: <style tag>`; ~1100ms.
  - *Ready*: `YOU SAID · mm:ss "<transcript>"` ink strip; label `DRAFTED FROM YOUR DICTATION` (or `REDRAFTED — ANOTHER TAKE` / `YOUR REPLY — the owl stays out of it` for r-mode); draft in serif 14.5px; actions `↵ SEND · E EDIT · ⇧R REDRAFT · V RE-DICTATE · ESC DISCARD`. Edit mode swaps in a textarea (accent border) with the same serif.
- Sending: toast `Sent as <address> — thread moved to WAITING` (if a reply is expected: thread auto-appears in Waiting at 0d) or `— thread filed away`; thread leaves the inbox.

### 5. Waiting ("no reply yet")
List rows: name · `4d silent` (accent, right) · gist · `NUDGED TODAY ✓` chip after nudging. Sheet: subject, `YOU → person · SENT n DAYS AGO`, summary of what you asked, `SILENCE` callout (accent border) — "4 days without an answer. The owl suggests a gentle nudge." — double rule, then the pre-drafted nudge (in the user's style) with `↵ SEND NUDGE · D STOP WAITING`. Empty state: "Nobody owes you a reply." / `RARE. ENJOY IT.`

### 6. Tasks
Rows: 12px square checkbox (Space toggles; filled inner square when done) · label (line-through when done) · due chip (accent filled; hollow when done) · `from <sender — subject>` source line. Task sheet: label, due, `SOURCE` card, `SPACE — DONE/REOPEN`, `O OPEN THREAD` (jumps to the email if still in the inbox).

### 7. Settings (⌘,) — sections: Accounts · Style · Intelligence
Left pane: three section rows (Accounts / Style / Intelligence) with dynamic sublines, j/k navigable. `g` then `s` jumps straight to the Style section.
- **Accounts sheet**: connected rows — provider glyph square (`F/H/N` for the three seeded accounts; `G`/`M`/`@` for added ones, same fill rules), address (mono), `provider · thread count` subline, status `✓ synced` (ink) / `sign-in…` / `indexing…` (accent), `DISCONNECT`. Add buttons `G GOOGLE`, `M MICROSOFT` (ink-filled; trigger browser OAuth → row shows "waiting for browser sign-in…" → indexing → synced) and `@ IMAP` (outline; expands inline form: address / imap host / app password + `CONNECT`, footnote "SSL, port 993"). Footnote: new addresses appear in filters after first sync; the owl reads the sent folder to learn that style.
- **Style sheet** (“Your style”): intro paragraph on per-address drafting (e.g. formal German for the Hausverwaltung from the personal address), then one card per address — mono address + stats (`132 replies · updated today`) · trait chips (`warm / brief / em-dashes / EN/DE`; hotmail: `höflich / formell / Sie-du aware`; nachtvogel: `lowercase / playful / no sign-off`) · italic sample sentence · `learn from my sends` toggle (26×14 ink toggle) · `RETRAIN` button with progress bar — plus a `TRY IT` callout and “forgets politely” footnote. Cards max-width 640px, `#F9F7F1` on the sheet.
- **Intelligence sheet**: header `BRING YOUR OWN KEY · CALLS GO STRAIGHT TO OPENROUTER · NOTHING PASSES THROUGH US`. OpenRouter key card: masked input `sk-or-v1-…` + `SAVE` (Enter also saves); status line "no key yet — scanning & drafting are paused" → "✓ saved · sk-or-•••• — in the macOS keychain, never leaves this machine". Two model cards, each a radio list (square radio, selected row = ink border + sheet bg; mono model id + italic note + price tag):
  - `MODEL — INBOX SCANNING` ("gists · tasks · silence-tracking, on every mail — cheap wins")
  - `MODEL — WRITING` ("your drafts, your nudges — quality wins")
  - Footnote: "No key? Mail still works — the owl just sleeps."

### 8. Overlays
- **⌘K palette**: 560px card, top-anchored (70px), scrim behind. Prompt `›`, live filter, contextual commands first (nudges with days, dictate for selected thread, summarize, accept task), then navigation/filters/settings/shortcuts/replay-onboarding. Active row: 2px accent left bar + paper bg. ↑↓/↵/Esc. Footer: `↑↓ CHOOSE · ↵ RUN · THE OWL INDEXES 2,318 THREADS`. Empty: "The owl knows no such command."
- **? shortcuts**: 660px card, 2-column grid of kbd + description rows, sign-off "The owl works while you sleep."
- **Toast**: bottom-center ink bar, accent square, mono 12px, auto-dismiss 3.6s.

## Interactions & Behavior — keyboard map (all global except in inputs)
- `j / k` — move selection (inbox / waiting / tasks / settings sections)
- `v` — start dictation; while listening, finishes early
- `e` — archive; **if a draft is open, toggles edit instead**
- `↵` — precedence: listening→finish · waiting view→send nudge · inbox with ready draft (not editing)→send · palette→run
- `r` — manual reply (opens editor seeded with the right greeting for the address)
- `⇧R` — alternate draft (each email has two canned takes)
- `t / x` — accept / dismiss the found task
- `⇧S` — summarize thread (toast with the gist)
- `z` — undo last archive (single-level)
- `d` — (waiting) stop waiting · `o` — (tasks) open source thread · `Space` — (tasks) toggle done
- `g` then `i/w/t/s/e` — go to view (1100ms window; footer shows the pending hint); `s` opens Settings → Style, `e` opens Settings
- `1 / 2 / 3` — filter by account, same key again clears
- `⌘1 / ⌘2 / ⌘3` — Inbox / Waiting / Tasks · `⌘,` — Settings · `⌘K` — palette
- `Esc` — cascade: palette → help → composer
- Ignore shortcuts when focus is in an input/textarea; ignore plain keys when ⌘/⌃/⌥ held (except the combos above). In Electron, register ⌘1–3/⌘,/⌘K via the application menu accelerators so Chromium doesn't eat them.

## State Management
Entities (see the `Component` class in the files for exact shapes and seed data):
- `emails[]`: `status in|out`, `unread`, `taskState suggested|accepted|dismissed|none`, `expectReply`, per-email `dict` transcript + `draft`/`draft2`
- `waiting[]`: `{from, days, nudged, sentLine, nudge}` — sending a reply with `expectReply` auto-appends at 0d
- `tasks[]`, `accounts[]`, `filter`, per-view selection ids
- Composer state machine: `idle → listening → drafting → ready (± editing)`
- Settings: `orKey/orSaved`, `scanModel`, `writeModel`
- Prototype timings: transcript 150ms/word · bars 110ms · drafting 1100ms · redraft 700ms · OAuth 1400ms→3000ms · IMAP 1800ms · toast 3600ms · archive 240ms

## Real integrations (replace the simulations)
- **Mail**: Gmail API, Microsoft Graph, and IMAP (SSL/993) sync into a local index. OAuth flows open the system browser.
- **Dictation**: macOS speech-to-text (SFSpeechRecognizer via a native module) or local whisper.cpp; stream partials into the listening strip.
- **LLM**: OpenRouter with the user's key, called from the main process. The model ids in the design (`google/gemini-2.5-flash`, `anthropic/claude-haiku-4.5`, `openai/gpt-5-mini`, `mistralai/mistral-small-3`, `anthropic/claude-sonnet-4.5`, `openai/gpt-5`, `google/gemini-2.5-pro`, `deepseek/deepseek-v4`) are **plausible placeholders — fetch the live model list from OpenRouter instead of hardcoding**. Scan model runs on every new mail (gist, task extraction, question detection, reply-expected classification); write model runs on demand (drafts, nudges).
- **Style learning is prompting, not training**: per address, keep N recent sent replies and derive a trait summary; inject both as few-shot context when drafting. "Retrain" = recompute the summary.
- **Key storage**: Electron `safeStorage` (or keytar) — matches the "macOS keychain" copy.
- **Waiting/nudges**: track sent messages that asked a question; a scheduler bumps day counts and surfaces nudge suggestions (optionally via Notification Center).
- **Persistence**: replace the prototype's localStorage onboarding flag with your settings store.

## i18n
Build **one UI with extracted strings** — not two hardcoded UIs. `Noctua Mail DE.dc.html` is the authoritative German copy (note German formats: `1.204` thousands dot, `4 T. still`, `Mi.` weekday, dates like `15. JULI`). The owl's tone must survive translation — it is part of the brand ("Die Eule arbeitet, während du schläfst.").

## Electron specifics
- `titleBarStyle: 'hiddenInset'` with the masthead as the drag region (`-webkit-app-region: drag`; mark buttons no-drag) so the design's own chrome is the window chrome; inset traffic lights sit left of the wordmark — add ~70px left padding to the masthead for them.
- `minWidth: 1180`, `minHeight: 760`.
- Menu accelerators for ⌘1–3, ⌘K, ⌘, (and standard macOS menus). Settings must also open from the app menu "Settings…".
- Bundle Newsreader + IBM Plex Mono font files; no runtime font fetch.

## Assets
None — no images or icon fonts. The owl mark is pure CSS (outlined square + two dots). All glyphs (`↳ ✓ ☐ ⌘ ⇧ ↵ ›`) are text.
