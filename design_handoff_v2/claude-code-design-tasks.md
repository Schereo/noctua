# Noctua — addendum + design implementation tasks (parallel worktrees)

Companion to `claude-code-tasks.md` (already dispatched — do NOT redo it, only apply the delta below).
Visual reference: `Noctua Design Changes.dc.html` — copy it into the repo (e.g. `design_handoff_v2/`) so agents can read exact values. Sections referenced as 2a/2b (owl search), 1b (onboarding), 1c (toast). All colors/type/spacing use the existing CSS vars in `paper.css` — no new tokens.

---

# Part 1 — Delta to the already-sent mechanical list

- **Task 3 (i18n):** SKIP `ChatView.tsx` — the component is replaced wholesale by Design Task A below. Extracting its strings first is wasted work. All other files in task 3 unchanged.
- **Task 4e (toast duration):** superseded by Design Task C (full toast queue). If C is running, skip 4e entirely; if C is deferred, do 4e as written.
- **Task 4 (help overlay):** additionally add a `/ — search & ask the owl` row and change the palette row's description to "commands" once Design Task A lands (A owns these strings; just don't fight over them).
- **Coordination / merge order:** mechanical tasks land first (they're in flight). Then **A**, then **C**. Task **B** is file-isolated and can merge anytime. Known trivial overlap: A and C both touch `App.tsx` (one mount line each); C rebases on mechanical task 2 (archive-on-sent) because the countdown toast's cancel path must trigger task 2's thread-restore.

---

# Part 2 — Global guardrails (apply to ALL three design tasks)

The last handoff produced controls that looked right but did nothing. These rules are non-negotiable:

1. **No dead UI.** Every element listed in a task's "wired controls" table must have a working handler with the exact observable effect stated. Before finishing: `grep -rn "onClick={() => {}}\|onClick={()=>{}}\|TODO\|FIXME" src/renderer` must come back empty for your files.
2. **Reuse existing plumbing.** Each task names the queries/stores/IPC channels to use. Read those files first. Do not invent parallel state, do not duplicate an IPC channel that exists, do not add npm dependencies.
3. **New IPC follows the contract.** Any new channel goes into `src/shared/ipc-contract.ts` with zod schemas, is handled in `src/main/ipc/`, and gets a contract test like the existing ones in `test/shared/contract.test.ts`.
4. **Every new string is i18n'd** — both `en` and `de` in `strings.ts`, keyed in the existing style. German keeps the owl's voice ("Die Eule arbeitet, während du schläfst" register).
5. **Buttons are `<button type="button">`** with visible `:focus-visible` (the paper.css default), `aria-pressed`/`aria-expanded` where stateful, `disabled` only with a reason shown in the UI.
6. **Definition of done, per task:** `pnpm typecheck` clean · `pnpm test` green incl. the task's new tests · the task's QA script passes by hand · no console errors/warnings in dev · EN and DE sweep of every new surface.
7. **Do not restyle anything outside your file scope.** Pixel values come from the design file; when in doubt copy from the nearest existing letterpress component, never from the old theme.

---

# Task A (worktree: `owl-search`) — Owl view: search + ask in one input

**Design:** sections 2a + 2b. Replaces ChatView; semantic mail search moves OUT of ⌘K and INTO this view.

**File scope:** NEW `src/renderer/src/features/owl/OwlView.tsx`, `OwlConversationsPane.tsx`, `src/renderer/src/stores/owl.ts` · EDIT `App.tsx`, `components/paper/Masthead.tsx`, `features/paper/ListPane.tsx`, `keyboard/keymap.ts`, `components/paper/Overlays.tsx`, `features/search/palette-router.ts`, `i18n/strings.ts`, `src/shared/ipc-contract.ts`, `src/main/ipc/*`, `src/main/db/*` · DELETE `features/chat/ChatView.tsx`.

### A1. View + navigation
- Keep the internal view id `'chat'` (menu ⌘5 accelerator already routes to it); user-facing label is `OWL` / de `EULE`.
- Masthead: DELETE the `masthead-search-trigger` button (and its CSS block if unused). ADD (a) a `SEARCH /` item styled exactly like `.masthead-nav-item` placed before INBOX, (b) an `OWL ⌘5` NavItem between TASKS and SETTINGS. Both are real NavItem buttons. SEARCH opens the view AND focuses the input; OWL just navigates. Active state (600 + 2px accent underline) applies to OWL when `view === 'chat'`.
- ListPane: `view === 'chat'` renders `OwlConversationsPane` (today it wrongly renders TasksList). Header `CONVERSATIONS` / right `↳ = THE OWL'S ANSWER`. Rows: question (serif 13.5), time (mmeta, `rowTime`), gist line `↳ first sentence of the answer` (italic secondary). Selected row = standard `.list-row[data-selected]`. Footer strip: `j/k move · ↵ open · n new question · ? keys`.

### A2. Conversation persistence (this is what makes the pane real, not a shell)
- New sqlite table `owl_conversations` (id, title, created_at, updated_at, messages JSON: `[{role, content, sources?}]`) via a migration following `src/main/db` patterns (migrations are tested — extend `test/db/migrations.test.ts`).
- New IPC: `owl:list` (returns id/title/updatedAt/answerGist), `owl:get {id}`, `owl:save {id?, title, messages}` (upsert, returns id), `owl:delete {id}`. Zod-validated, contract-tested.
- `stores/owl.ts` (zustand): `selConversationId`, `draft query`, `hits state`, `asking state`. Conversations themselves come from a react-query hook (`queries/owl.ts`) so invalidation matches the codebase style.
- Save on: first completed answer (title = the question), every completed follow-up. Never save empty/aborted asks.

### A3. The input (sheet top) — state machine
States: `empty → typing(hits) → asking(streaming) → conversation(idle) → typing(follow-up context)`.
- **Typing:** live hits via the EXISTING `useSemanticSearch` + `useDebouncedValue(300)` (move these hooks' usage from Overlays; the hook itself stays where it is). Free, local, no LLM call. Render: ask row first (accent 3px left bar + paper bg when active), then `MAIL · BEST MATCHES` label, then up to 8 hit rows per the 2a mock (subject 550 15px serif, time, sender mono ‹addr›, `account / mailbox`, `CLEAR MATCH`/`POSSIBLE` accent tag, 2-line clamped excerpt).
- **↑↓** moves selection over [ask row, ...hits] (ask row is index 0). **↵ on a hit** opens the thread — reuse the exact jump logic from Overlays `run()` for mail entries: `setView('inbox')`, `setMbox(visibleMailboxForSearchHit(hit.mailbox) ?? 'inbox')`, `setSelThreadKey(hit.threadKey)`. **↵ on the ask row (or with nothing navigated)** asks the owl.
- **Asking:** call the EXISTING `ai:chat` (`{question, history}`), stream via `ai:chatChunk` push (match `payload.chatId`, append `chunk`, `sources`, finish on `done`, surface `error` inline — not a toast). Streaming cursor: 8×15px accent block, as in the mock. The current hits become the sources context visually; render `SOURCES` card from `payload.sources` (rows per 2a/1a: `[n]` accent, subject, `account / mailbox · date`, `OPEN →` = same jump logic).
- **Follow-up:** input stays at sheet top; when a conversation is open, ↵ asks with `history` = that conversation's messages. `n` (and the pane's NEW QUESTION affordance) clears to `empty`.
- **No key saved** (`useOrKeyStatus().hasKey === false`): hits still work; ask row renders disabled with copy `the owl sleeps — add a key in Intelligence` (en) / `Die Eule schläft — Schlüssel unter Intelligenz hinterlegen` (de), clicking it deep-links `setView('settings') + setSetSel('intel')`. THIS MUST NOT throw or silently no-op.
- Index status footer (from the palette): `THE OWL INDEXES {n} THREADS · {coverage}% EMBEDDED · LOCAL` — reuse the palette's `footerStatus` data (`semanticSearch.data.index`).

### A4. Keymap + palette slimming
- `keymap.ts`: `/` → `setView('chat')` + focus input (today: opens palette). `⌘F` (menu 'search' action in App.tsx) → same. `n` inside chat view → new question. Esc cascade: clear query if non-empty, else normal cascade. Keep ⌘K = palette. **Do not break:** typing guard (`typing` check) must exempt the owl input from global single-key shortcuts, like other inputs.
- `Overlays.tsx` / `palette-router.ts`: remove mail-search routing, mail section, skeletons, debounce usage from the palette; it filters commands only. Add command `Search & ask the owl` (note: `mail search lives here now`, key `/`) → view + focus. Palette footer: `↑↓ CHOOSE · ↵ RUN · MAIL SEARCH: / — WITH THE OWL`. UPDATE `test/renderer/palette-router.test.ts` to the simplified router (router keeps command filtering + `>` forced-command mode if present).

### A5. Wired-controls table (verify each)
| Control | Event | Effect |
|---|---|---|
| Masthead SEARCH / | click, `/`, ⌘F | view=chat, input focused |
| Masthead OWL ⌘5 | click, ⌘5 | view=chat |
| Conversation row | click, j/k+↵ | loads conversation into sheet (owl:get) |
| Row delete (if you add one) | click | owl:delete + list invalidate — otherwise don't render one |
| Ask row | click / ↵ | streams answer; disabled+deep-link when no key |
| Hit row | click / ↑↓+↵ | jumps to thread (correct mailbox) |
| Source OPEN → | click | jumps to thread |
| Suggestion chips (empty state) | click | fills input + asks |
| n / NEW QUESTION | key / click | clears to empty state, focus input |

### A6. Tests + QA
- Unit: owl store transitions (typing→asking→conversation, follow-up history assembly, no-key gating), palette-router simplification, conversation persistence round-trip (in-memory DB, like `test/db/repos.test.ts`).
- QA script: fresh DB → owl view empty state → type "hetzner" → hits appear ≤ ~400ms → ↓↵ opens correct thread in correct mailbox → back (⌘5) → type question → ↵ streams answer with sources → restart app → conversation still listed with gist → EN/DE sweep → no key: ask row disabled, deep-link works.

---

# Task B (worktree: `onboarding-key`) — key step + honest paused training

**Design:** section 1b. **File scope:** `features/paper/Onboarding.tsx` (+ optionally extract `onboarding-steps.ts` pure logic), `i18n/strings.ts`, `queries/intel.ts` (read), and the key-save IPC ALREADY used by `SettingsSheets.tsx` IntelSheet — read that file first and reuse its exact channel + status query (`useOrKeyStatus`). No new IPC.

### B1. Flow
Steps become 1 welcome → 2 connect → 3 **key** → 4 training. Enter advances (existing pattern; still ignored while an input is focused). Step labels: `STEP 3 OF 4 — THE OWL'S EYES` / `STEP 4 OF 4 — YOUR VOICE` (de mirrors existing obStep* style).

### B2. Step 3 (key) — wired controls
- Masked input (paper-input, mono) + `SAVE — ↵` ink button: saves via the IntelSheet channel; on success show `✓ saved · sk-or-•••• — in the macOS keychain, it never leaves this machine` (reuse/extend the existing intel status strings); on failure show the error inline under the input (accent), not a toast.
- Enter inside the input = save (not step-advance). After a successful save, primary CTA becomes `TRAIN MY VOICE — ↵` (enabled) → step 4.
- `skip — the owl sleeps until then` link → step 4 in **paused** mode. Footnote line `no account yet? openrouter.ai/keys…` — the URL opens via `app:openExternal`, never in-window.
- If a key already exists (replay-onboarding case): pre-fill masked status, CTA enabled immediately.

### B3. Step 4 (training) — three real states per account row
1. **Running** (key exists): exactly today's behavior (progress interval to 92%, `ai:refreshStyle`, traits at 100%). Keep.
2. **Paused** (skipped): NO fake progress. Empty track, `PAUSED — NO KEY` (accent mono), callout card with `ADD KEY` button → returns to step 3 with input focused. CTA `ENTER YOUR MAIL — ↵` stays enabled; footnote `mail works without a key — the owl just sleeps`.
3. **Failed** (key exists but `ai:refreshStyle` rejects): row shows `FAILED — RETRY` where RETRY is a button re-invoking `ai:refreshStyle` for THAT account only. Never silently mark 100%.
- Auto-resume: when a key is saved later in IntelSheet, trigger `ai:refreshStyle` for every account whose `ai.styleProfile.{id}` setting is empty (hook into the IntelSheet save success path; keep it renderer-side).

### B4. Tests + QA
- Extract step/enablement logic into `onboarding-steps.ts` (pure): next-step gating, CTA enablement, row-state derivation (running/paused/failed/done) — unit test it (pattern: `test/renderer/composer-state.test.ts`).
- All CTAs/links become real buttons (aligns with mechanical task 5 — if that task already converted them, rebase, don't duplicate).
- QA: fresh run with no key → skip → paused rows, no fake 100% → ADD KEY → back to step 3 focused → save bad key → inline error → save good key → step 4 runs, traits appear → replay onboarding → key pre-filled. EN/DE sweep.

---

# Task C (worktree: `toast-queue`) — one toast queue, four variants

**Design:** section 1c. Replaces `PaperToast`, `OutboxToast`, and the `UpdateBanner` surface.
**File scope:** NEW `src/renderer/src/stores/toast.ts`, `components/paper/Toast.tsx` · EDIT `App.tsx` (mount), `stores/paper.ts` (toastNow shim), `stores/send.ts`, `components/UpdateBanner.tsx` (delete after migrating), `components/OutboxToast.tsx` (delete), `components/paper/Overlays.tsx` (remove PaperToast), `i18n/strings.ts`. **Rebase on mechanical task 2** (archive-on-sent) before wiring cancel.

### C1. Store (pure, unit-testable — write this first)
`stores/toast.ts`: queue of `{id, kind: 'info'|'action'|'countdown'|'error', text, action?: {label, kbd?, run}, dismiss?: boolean, expiresAt?: number, countdown?: {until: number, onCancel}}`.
Rules (test each): single visible toast; priority `countdown > error > action > info`; a higher-priority arrival preempts (preempted info re-shows after, only if still < 8s old); info expires 3600ms; **action lives exactly as long as its offer** (filed = the 5s archive window — accept a per-toast `expiresAt`); countdown holds until `until`, then auto-swaps to its `done` info text; error persists until dismissed. Public API: `toast.info(text)`, `toast.action(text, {label, kbd, run}, windowMs)`, `toast.countdown(...)`, `toast.error(text, opts)`.

### C2. Component (per 1c mock)
Fixed bottom 26px, centered, maxWidth 70%, z-50. Ink bar (`--ink` bg, `#F4F1EA` text, `4px 4px 0 rgba(23,21,15,.2)` shadow), 7px accent square (countdown: circular rec-dot pulsing — reuse the `mail-composer-recording-pulse` keyframe pattern), mono 12px text. Action buttons: 1px `--on-ink-muted` border, paper text, kbd chip inside (`Z`, `⌘Z`); hover inverts (paper bg, ink text). Countdown adds a 2px progress rail: `rgba(244,241,234,.18)` track, accent fill draining left→right with remaining time. Error variant: 1px accent border on the bar; actions per C3. A11y: `role="status"` (error: `role="alert"`); actions are buttons; the whole bar is not clickable.

### C3. Migrations (each with its real logic)
- **`usePaper.toastNow` becomes a shim** calling `toast.info` — call sites unchanged. Delete PaperToast render.
- **Filed/archive** (`EmailSheet.archive`): `toast.action(t('toastFiled'), {label: 'UNDO', kbd: 'Z', run: undoArchive}, 5000)` — the button and the `z` key do the same thing; window matches `stageArchive`'s 5000ms exactly (single source: export the constant).
- **Undo-send** (`stores/send.ts begin`): `toast.countdown` with `until = sendAt`, action `UNDO ⌘Z` → `cancel(outboxId)` (which, post-task-2, restores the thread + draft). Bind ⌘Z globally ONLY while a countdown toast is visible (keymap guard: not when typing). On `outbox:changed → sent`: swap to info `Sent as {addr} — thread moved to WAITING` / `— filed away` (pick via the send's `expectReply`/waiting outcome if available; otherwise the neutral `Sent as {addr}`). On `canceled`: drop silently (the composer restore is the feedback).
- **Send error**: `toast.error(t('toastSendFailed'), {action: OPEN DRAFT → the existing cancel()/draft-restore path})` + DISMISS. (Deviation from mock: no blind RETRY — there is no retry IPC; OPEN DRAFT is the honest recovery. Note this in the PR.)
- **UpdateBanner** → `toast.info(t('updateAvailable', {v}), {label: 'RESTART', run: <existing update IPC from UpdateBanner.tsx>})`, persistent until acted/dismissed (use `dismiss: true`); delete the top banner. Read `UpdateBanner.tsx`/`src/main/updates.ts` for the real channel — do not stub it.
- Delete `OutboxToast.tsx` and its German strings; all new strings i18n'd EN+DE.

### C4. Tests + QA
- Unit: queue reducer (priority, preemption + re-show rule, expiry classes, countdown swap), Z/⌘Z routing guards.
- QA: archive → UNDO button and `z` both restore within 5s, toast dies at 5s not 3.6 → send reply → countdown drains, ⌘Z cancels and (post task 2) the thread is back with the draft → let one send complete → confirmation info → force a send error (kill network) → error toast persists, OPEN DRAFT restores → trigger gist toast while countdown active → info waits, shows after if fresh → EN/DE sweep.

---

## Suggested dispatch
Three worktrees off main (after the mechanical batch merges): `owl-search` (A), `onboarding-key` (B), `toast-queue` (C). Merge B anytime; A before C only to keep the `App.tsx` conflict trivial. Each PR must include: its wired-controls verification, test list, and the QA script transcript.
