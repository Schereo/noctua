# Noctua — mechanical fixes for Claude Code

Source: design review of `main` @ `efe4dc2` (v0.50.0). These are behavior/copy/a11y fixes with no new UI design.
Do NOT restyle or redesign anything here — visual changes (chat view, onboarding key step, merged toast visuals) arrive as a separate design handoff.

---

## 1. Waiting view: require ⌘↵ to send a nudge (safety)

**Files:** `src/renderer/src/keyboard/keymap.ts`, `src/renderer/src/features/paper/WaitingSheet.tsx`, `src/renderer/src/i18n/strings.ts`

- Today plain `Enter` in the Waiting view dispatches `paper:waiting → 'enter'` → `sendNudge()`. One unfocused keystroke sends a real email.
- Change the keymap so `view === 'waiting'` sends only on **⌘/Ctrl + Enter** (mirror the existing `⌘Enter → dispatch('mail','enter')` block, which is currently gated to `view === 'inbox'`).
- Plain Enter in Waiting should do nothing (or focus the nudge draft, your call — nothing is fine).
- Update the visible hint: the send button in `WaitingSheet` shows an `↵` icon (`waiting-action-icon`); change to `⌘↵`. Check `helpEnter` in strings.ts (see task 4) and any Waiting-related palette command notes.
- Tests: `test/renderer/*` has keymap-adjacent tests; add one asserting plain Enter in waiting view does not dispatch send.

## 2. Send flow: archive on actual send, restore on undo (data safety)

**Files:** `src/renderer/src/features/paper/EmailSheet.tsx` (`sendDraft`), `src/renderer/src/stores/send.ts` (`cancel`, `useOutboxEchoLifecycle`), possibly `src/main/smtp/*` outbox events

Current behavior (bug):
- `sendDraft` calls `compose:send`, then immediately `messages:action { action: 'archive' }` on the whole thread — before the undo-send countdown expires.
- `cancel()` in send.ts cancels the outbox item and re-opens the draft via `saveComposeDraft` + `setView('compose')` — the thread stays archived and the reply draft loses its thread context.
- This path also bypasses the staged-archive/undo (`stageArchive`, `z`) used by the `e` key.

Target behavior:
- On queue: do NOT archive. Optionally hide the thread optimistically via the existing `stageArchive`-style staging keyed to the outbox item.
- On `outbox:changed → state 'sent'`: commit the archive (invalidate `['threads']`).
- On `outbox:changed → state 'canceled'` (or `cancel()`): un-hide the thread, restore `selThreadKey` to it, and restore the draft into the reply composer (`usePaper` comp state with `threadKey`, `text`, `html`, `mode: 'ready'`) instead of routing to the blank compose view. Keep the compose-view restore only for sends that originated in ComposeSheet (no `replyToMessageId`/threadKey).
- Keep the existing draft-removal (`removeDraft(threadKey)`) but only after the archive commits.
- Tests: extend `test/renderer/sendEcho.test.ts` / add a test that cancel restores thread selection and does not archive.

## 3. i18n: route hardcoded German through strings.ts

**Files:** `src/renderer/src/features/chat/ChatView.tsx`, `src/renderer/src/components/OutboxToast.tsx`, `src/renderer/src/components/UpdateBanner.tsx`, `src/renderer/src/features/onboarding/AddAccountDialog.tsx`, `src/renderer/src/features/inbox/OverrideMenu.tsx`, `src/renderer/src/components/MailFrame.tsx`
**Table:** `src/renderer/src/i18n/strings.ts` (+ `useT()` from `@renderer/lib/i18n`)

Hardcoded strings to extract (non-exhaustive — sweep each file):
- ChatView: the 3 `SUGGESTIONS`, "Frag dein Postfach.", input placeholder "Frage über deine Mails… (↵ senden)", "Fragen", "Fehler: …", source-chip title "Thread öffnen", "(ohne Betreff)"
- OutboxToast: "Wird gesendet…", "Senden in {n}s", "Rückgängig"
- UpdateBanner: "Version {v} ist verfügbar" + button label
- AddAccountDialog: "Konto hinzufügen", provider notes, error strings, footnotes
- OverrideMenu: "Kategorie setzen für:", "(Kein Betreff)"
- MailFrame: "{n} Remote-Bild(er) blockiert (Tracking-Schutz)", "Anzeigen", "Immer für {addr}"

Conventions: follow existing key style (`toastX`, `composerX`…), always add both `en` and `de`. The DE strings that exist today ARE the authoritative German — keep them verbatim as the `de` values. Plural forms: follow existing patterns in the table (separate keys or `{n}` interpolation).

## 4. Keyboard documentation truth (copy only, no behavior)

**Files:** `src/renderer/src/components/paper/Overlays.tsx`, `src/renderer/src/i18n/strings.ts`, `src/renderer/src/features/paper/ListPane.tsx`

- a) Palette command `id: 'style'` shows `key: 'g s'` — there is no g-sequence in keymap.ts. Remove the key label (or implement g-sequences; removing is fine).
- b) `helpEnter` says "send the draft / run command" — plain ↵ never sends an inbox draft (⌘↵ does). Reword to match reality after task 1, e.g. en: "finish dictation / run command" and a separate `⌘↵ — send" row.
- c) Dictation is documented as `⌘D` in the ListPane footer but `v` in the help overlay; both work (`keymap.ts` handles both). Pick ⌘D as canonical everywhere, mention `v` as alias in the help overlay only.
- d) `toastFiled` says "Deleted — z to undo" / "Gelöscht…" but the action is **archive**. Change to filing language (en: "Filed — z to undo", de: "Abgelegt — z macht's rückgängig").
- e) The filed toast auto-dismisses at 3600ms but the undo window (`stageArchive`) is 5000ms. Either pass a per-toast duration (5000 for this one) or extend `toastNow` default; do not shorten the undo window.

## 5. Interactive spans → real buttons (a11y)

**Files:** `src/renderer/src/features/paper/OwlRail.tsx`, `src/renderer/src/features/paper/EmailSheet.tsx` (task strip "T ADD" / "X", spam "NOT SPAM"), `src/renderer/src/features/paper/Onboarding.tsx` (CTAs, provider connect, skip), `src/renderer/src/features/paper/TaskSheet.tsx` (space/open-thread actions), `src/renderer/src/features/paper/WaitingSheet.tsx` is already correct — use its `waiting-action` buttons as the reference pattern.

- Replace `onClick` spans/divs with `<button type="button">`, keeping the exact current styling (the global CSS resets in paper.css already style buttons; add `appearance: none; border: 0; background: transparent; font: inherit` where a class doesn't).
- Checkbox squares (`checkbox-square` in ListPane/OwlRail) should become buttons with `aria-pressed` or real checkboxes.
- Do not change layout, spacing, or type sizes. Verify every converted control gets the existing `:focus-visible` outline.

## 6. Hit targets ≥ 24px (a11y, no visual change)

**Files:** `src/renderer/src/features/paper/OwlRail.tsx` (draft delete `×`), `src/renderer/src/features/paper/EmailSheet.tsx` (task dismiss `X`), chips acting as buttons elsewhere.

- Keep glyph/type sizes; expand the interactive box via padding + negative margin (e.g. `padding: 8px; margin: -8px`) so layout is unchanged.

## 7. Persist the "nudged" state

**Files:** `src/renderer/src/features/paper/WaitingSheet.tsx`, followups IPC (`src/shared/ipc-contract.ts`, `src/main/db/*` followups repo), `src/renderer/src/features/paper/ListPane.tsx` (WaitingList row)

- `nudgedIds` is a `useState` Set — lost on unmount. Persist a `nudgedAt` timestamp on the followup record (DB + IPC), have `useFollowups()` return it.
- WaitingSheet: derive `isNudged` from `nudgedAt` being today.
- WaitingList row: when nudged today, show the chip `NUDGED TODAY ✓` (mono 8.5px, 1px hairline border, muted — same pattern as existing `mchip` outline chips; copy exists in the design handoff DE/EN files).

## 8. Empty center sheets (small, copy-only)

**Files:** `EmailSheet.tsx`, `WaitingSheet.tsx`, `TaskSheet.tsx` — each returns `<div className="flex flex-1" />` when nothing is selected.

- Render a minimal centered empty state on the sheet instead: italic serif line + mono sub, reusing the exact strings already shown in the list pane (`inboxZero`/`waitingEmpty`/`tasksEmpty` + subs). No new copy, no illustration, no card — just quiet text on the paper background.

---

## Explicitly out of scope (design in progress, will arrive as handoff)
- Chat view letterpress redesign + navigation entry
- Onboarding OpenRouter-key step (flow + visuals)
- Unified toast system visuals (implement task 4e minimally; the merged queue design comes later)
- Composer typography decision (serif vs. Arial)

## Verify after
- `pnpm typecheck && pnpm test`
- Manual: EN language sweep (no German in chat/toasts/dialogs), keyboard-only pass over rail + task strip, send→undo restores thread, Enter in Waiting does nothing.
