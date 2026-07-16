import { useEffect, useRef, useState } from 'react'
import { usePaper } from '@renderer/stores/paper'
import { useOwl, owlPhase, type OwlDraftMessage } from '@renderer/stores/owl'
import { useDictation } from '@renderer/lib/useDictation'
import { DictationStrip } from '@renderer/components/DictationStrip'
import { invoke, onPush } from '@renderer/lib/ipc'
import { rowTime, useI18n, useT } from '@renderer/lib/i18n'
import { useOrKeyStatus } from '@renderer/queries/intel'
import { useSaveOwlConversation } from '@renderer/queries/owl'
import {
  reconcilePaletteSelection,
  visibleMailboxForSearchHit
} from '@renderer/features/search/palette-router'
import {
  useDebouncedValue,
  useSemanticSearch,
  type SemanticSearchHit
} from '@renderer/features/search/useSemanticSearch'
import type { OwlSource } from '@shared/types'
import { OwlAnswerMarkdown } from './OwlAnswerMarkdown'
import { citedSourceIndices } from './owl-markdown'
import { OwlGlyph } from '@renderer/components/paper/OwlGlyph'

// Die Owl-View: Suchen und Fragen teilen sich EIN Eingabefeld am Blattkopf.
// Tippen liefert freie, lokale Live-Treffer (useSemanticSearch); erst ↵ auf
// der Frage-Zeile gibt Tokens aus (ai:chat-Streaming). Ersetzt ChatView.

const MAILBOX_LABEL = {
  inbox: 'palMailboxInbox',
  sent: 'palMailboxSent',
  archive: 'palMailboxArchive',
  other: 'palMailboxOther'
} as const

const SUGGESTION_KEYS = ['chatSuggestion1', 'chatSuggestion2', 'chatSuggestion3'] as const

function coveragePercent(coverage: number): number {
  const percent = coverage <= 1 ? coverage * 100 : coverage
  return Math.max(0, Math.min(100, Math.round(percent)))
}

/** Blinkender Block-Cursor der streamenden Antwort (8×15, Akzent). */
function StreamCaret(): React.JSX.Element {
  return <span className="owl-caret" aria-hidden="true" />
}

export function OwlView(): React.JSX.Element {
  const t = useT()
  const lang = useI18n((s) => s.lang)
  const paper = usePaper()
  const owl = useOwl()
  const orStatus = useOrKeyStatus()
  const save = useSaveOwlConversation()
  const saveMutate = save.mutate
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const dictation = useDictation({
    onText: (text) => {
      const current = useOwl.getState().query
      useOwl.getState().setQuery(current.trim() ? `${current.trimEnd()} ${text}` : text)
      setSelection({ id: null, manual: false })
      requestAnimationFrame(() => inputRef.current?.focus())
    },
    onError: (message) => paper.toastNow(message)
  })
  const scrollRef = useRef<HTMLDivElement>(null)
  const [selection, setSelection] = useState<{ id: string | null; manual: boolean }>({
    id: null,
    manual: false
  })

  // Kein Schlüssel → Frage-Zeile schläft (nur bei explizitem false, nie beim Laden)
  const noKey = orStatus.data?.hasKey === false
  const phase = owlPhase(owl)

  const debouncedQuery = useDebouncedValue(owl.query, 300)
  const queryIsCurrent = debouncedQuery === owl.query
  const searchable = phase === 'typing' && owl.query.trim().length >= 2
  const search = useSemanticSearch(debouncedQuery, searchable && queryIsCurrent)
  const hits: SemanticSearchHit[] =
    searchable && queryIsCurrent && search.data ? search.data.hits.slice(0, 8) : []
  const searchPending = searchable && (!queryIsCurrent || search.isFetching)

  // Auswahl läuft über [Frage-Zeile, …Treffer] — die Frage-Zeile ist Index 0
  const entryIds = phase === 'typing' ? ['ask', ...hits.map((h) => `hit:${h.messageId}`)] : []
  const visibleSelection = reconcilePaletteSelection(selection, entryIds)
  const activeId = visibleSelection.id

  // Fokus-Anforderungen (/, ⌘F, Masthead SEARCH, n) einlösen, sobald die View steht
  const pendingFocus = useOwl((s) => s.pendingFocus)
  useEffect(() => {
    if (!pendingFocus) return
    inputRef.current?.focus()
    useOwl.getState().clearFocusRequest()
  }, [pendingFocus])

  // Neueste Frage steht oben — bei jeder neuen Frage/Antwort nach oben springen.
  // Streaming-Chunks (gleiche Anzahl Nachrichten) scrollen bewusst nicht:
  // wer gerade in älteren Antworten liest, wird nicht hochgerissen.
  const messageCountRef = useRef(0)
  useEffect(() => {
    if (owl.messages.length === messageCountRef.current) return
    messageCountRef.current = owl.messages.length
    scrollRef.current?.scrollTo({ top: 0 })
  }, [owl.messages])

  // n aus der Keymap: neue Frage
  useEffect(() => {
    const onOwl = (e: Event): void => {
      if ((e as CustomEvent<string>).detail !== 'new') return
      useOwl.getState().newQuestion()
      useOwl.getState().requestFocus()
    }
    window.addEventListener('paper:owl', onOwl)
    return () => window.removeEventListener('paper:owl', onOwl)
  }, [])

  // Antwort-Streaming: Chunks anwenden, nach vollständiger Antwort persistieren.
  // Leere oder abgebrochene Fragen werden nie gespeichert (failAsk räumt auf).
  useEffect(
    () =>
      onPush('ai:chatChunk', (payload) => {
        const before = useOwl.getState()
        const accepted = before.chatId !== null && before.chatId === payload.chatId
        before.applyChunk(payload)
        if (!accepted || !payload.done || payload.error) return

        const after = useOwl.getState()
        const finished = after.messages.filter((m) => !m.pending)
        const answer = finished[finished.length - 1]
        const title = finished.find((m) => m.role === 'user')?.content
        if (!title || answer?.role !== 'assistant' || !answer.content.trim()) return
        saveMutate(
          {
            id: after.selConversationId ?? undefined,
            title: title.slice(0, 500),
            messages: finished.map((message) => {
              // pending ist reiner View-Zustand — nie mit persistieren
              const persisted = { ...message }
              delete persisted.pending
              return persisted
            })
          },
          {
            onSuccess: ({ id }) => {
              // n könnte inzwischen gedrückt worden sein — dann nichts anheften
              if (useOwl.getState().messages.length > 0) useOwl.getState().setSaved(id)
            }
          }
        )
      }),
    [saveMutate]
  )

  /** Exakte Sprung-Logik der alten Palette: Ansicht, sichtbare Mailbox, Thread. */
  const jumpToThread = (threadKey: string, mailbox?: SemanticSearchHit['mailbox']): void => {
    paper.setView('inbox')
    // Archiv-/Custom-Ordner haben keinen eigenen Tab: neutral in den Eingang
    // wechseln; setMbox löscht die Auswahl, deshalb danach den Thread setzen.
    paper.setMbox((mailbox ? visibleMailboxForSearchHit(mailbox) : null) ?? 'inbox')
    paper.setSelThreadKey(threadKey)
  }

  /** Deep-Link der schlafenden Eule: Einstellungen → Intelligenz. */
  const openIntelSettings = (): void => {
    paper.setView('settings')
    paper.setSetSel('intel')
  }

  /** Frage stellen — darf ohne Schlüssel weder werfen noch still verpuffen. */
  const ask = (question: string): void => {
    if (noKey) {
      openIntelSettings()
      return
    }
    const q = question.trim().slice(0, 2000)
    const begun = useOwl.getState().beginAsk(q, hits)
    if (!begun) return
    setSelection({ id: null, manual: false })
    invoke('ai:chat', { question: q, history: begun.history })
      .then(({ chatId }) => useOwl.getState().setChatId(chatId))
      .catch((error) =>
        useOwl.getState().failAsk(error instanceof Error ? error.message : String(error))
      )
  }

  const moveSelection = (delta: -1 | 1): void => {
    if (entryIds.length === 0) return
    const current = Math.max(0, entryIds.indexOf(activeId ?? 'ask'))
    const next = Math.max(0, Math.min(entryIds.length - 1, current + delta))
    setSelection({ id: entryIds[next], manual: true })
  }

  const runActiveEntry = (): void => {
    const hit = hits.find((h) => `hit:${h.messageId}` === activeId)
    if (hit) jumpToThread(hit.threadKey, hit.mailbox)
    else ask(owl.query)
  }

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    // Einsprechen: ⌘D startet/beendet, Enter beendet, Esc verwirft
    if ((e.metaKey || e.ctrlKey) && (e.key === 'd' || e.key === 'D')) {
      e.preventDefault()
      e.stopPropagation()
      if (dictation.state === 'listening') dictation.finish()
      else if (dictation.state === 'idle') dictation.start()
      return
    }
    if (dictation.state === 'listening') {
      if (e.key === 'Enter') {
        e.preventDefault()
        dictation.finish()
      } else if (e.key === 'Escape') {
        dictation.cancel()
      }
      e.stopPropagation()
      return
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      e.stopPropagation()
      moveSelection(e.key === 'ArrowDown' ? 1 : -1)
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      e.stopPropagation()
      if (phase === 'typing') runActiveEntry()
      else ask(owl.query)
    } else if (e.key === 'Escape' && owl.query) {
      // Esc-Kaskade, Stufe 1: nur das Feld leeren — sonst normal durchreichen
      e.preventDefault()
      e.stopPropagation()
      owl.setQuery('')
      setSelection({ id: null, manual: false })
    }
  }

  const index = search.data?.index ?? null
  const locale = lang === 'de' ? 'de-DE' : 'en-GB'
  const indexStatus = index
    ? t('owlIndexStatus', {
        n: index.searchableMessages.toLocaleString(locale),
        coverage: coveragePercent(index.coverage)
      })
    : t('palIndexLocal')

  const renderAskRow = (): React.JSX.Element => {
    const active = activeId === 'ask'
    return (
      <button
        type="button"
        className="owl-ask-row"
        data-active={active}
        aria-disabled={noKey}
        onClick={() => ask(owl.query)}
      >
        <span className="owl-ask-row__label">
          {t('owlAskLabel')}{' '}
          <em>
            {lang === 'de' ? '„' : '“'}
            {owl.query.trim()}
            {lang === 'de' ? '“' : '”'}
          </em>
        </span>
        <span
          className="owl-ask-row__note"
          data-sleeping={noKey}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          {noKey && <OwlGlyph pose="asleep" size={15} color="var(--muted)" />}
          {noKey ? t('owlAskDisabled') : t('owlAskNote')}
        </span>
        <span className="owl-ask-row__key">↵</span>
      </button>
    )
  }

  const renderHits = (): React.JSX.Element => (
    <>
      {renderAskRow()}
      <div className="owl-hits-label">
        {t('owlHitsLabel')} <span>· {t('owlHitsNote')}</span>
      </div>
      {search.isError && queryIsCurrent ? (
        <div className="palette-section__empty palette-section__empty--error">
          {t('palSearchError')}
        </div>
      ) : hits.length > 0 ? (
        hits.map((hit) => {
          const id = `hit:${hit.messageId}`
          const active = id === activeId
          const sender = hit.fromName?.trim() || hit.fromAddr || t('palUnknownSender')
          return (
            <button
              type="button"
              key={id}
              className="palette-mail-row owl-hit-row"
              data-active={active}
              onClick={() => jumpToThread(hit.threadKey, hit.mailbox)}
            >
              <span className="palette-mail-row__topline">
                <span className="palette-mail-row__subject">
                  {hit.subject || t('palNoSubject')}
                </span>
                <span className="palette-mail-row__time">{rowTime(lang, hit.date)}</span>
              </span>
              <span className="palette-mail-row__meta">
                <span className="palette-mail-row__sender" title={hit.fromAddr ?? undefined}>
                  {sender}
                  {hit.fromAddr && sender !== hit.fromAddr ? ` ‹${hit.fromAddr}›` : ''}
                </span>
                <span className="palette-mail-row__location">
                  {hit.accountName} / {t(MAILBOX_LABEL[hit.mailbox])}
                </span>
                <span className="owl-hit-row__actions">
                  <span
                    className="palette-mail-row__confidence"
                    data-possible={hit.confidence !== 'clear'}
                  >
                    {t(hit.confidence === 'clear' ? 'palHitClear' : 'palHitPossible')}
                  </span>
                  {active && <span className="owl-hit-row__open">{t('owlHitOpen')}</span>}
                </span>
              </span>
              <span className="palette-mail-row__excerpt">{hit.excerpt}</span>
            </button>
          )
        })
      ) : searchPending || owl.query.trim().length < 2 ? null : (
        <div className="palette-section__empty">{t('palNoMail')}</div>
      )}
    </>
  )

  const renderSources = (sources: OwlSource[], alsoChecked: number): React.JSX.Element => (
    <>
      <div className="mlabel" style={{ color: 'var(--muted)', marginTop: 20 }}>
        {t('owlSources')}
      </div>
      <div className="owl-sources">
        {sources.map((source) => (
          <div className="owl-source-row" key={`${source.index}-${source.threadKey}`}>
            <span className="owl-source-row__index">[{source.index}]</span>
            <span className="owl-source-row__subject">{source.subject ?? t('palNoSubject')}</span>
            {source.accountName && source.mailbox && (
              <span className="owl-source-row__meta">
                {source.accountName} / {t(MAILBOX_LABEL[source.mailbox])}
                {source.date ? ` · ${rowTime(lang, source.date)}` : ''}
              </span>
            )}
            <button
              type="button"
              className="owl-source-row__open"
              onClick={() => jumpToThread(source.threadKey, source.mailbox)}
            >
              {t('owlSourceOpen')}
            </button>
          </div>
        ))}
        {alsoChecked > 0 && (
          <div className="owl-sources__more">{t('owlSourcesAlsoChecked', { n: alsoChecked })}</div>
        )}
      </div>
    </>
  )

  const renderTurn = (message: OwlDraftMessage, i: number): React.JSX.Element => {
    if (message.role === 'user') {
      return (
        <div className="owl-turn-you" key={i}>
          <span className="owl-turn-you__label">
            {t('owlYou', { time: rowTime(lang, message.at ?? null) })}
          </span>
          <span className="owl-turn-you__text">{message.content}</span>
        </div>
      )
    }
    // Die QUELLEN-Karte zeigt die Belege der Antwort, nicht den ganzen
    // Suchkorb: auf die im Text zitierten [n] gefiltert, der Rest erscheint
    // nur als Zähler. Ohne Zitate (ältere Gespräche, freie Antworten) bleibt
    // der volle Korb samt der alten Thread-Formulierung sichtbar.
    const retrieved = message.sources ?? []
    const citedIdx = message.pending ? [] : citedSourceIndices(message.content)
    const cited = retrieved.filter((source) => citedIdx.includes(source.index))
    const shown = cited.length > 0 ? cited : retrieved
    const answeredLabel =
      shown.length === 0
        ? ''
        : cited.length > 0
          ? shown.length === 1
            ? t('owlAnsweredFromOneSource')
            : t('owlAnsweredFromSources', { n: shown.length })
          : shown.length === 1
            ? t('owlAnsweredFromOne')
            : t('owlAnsweredFrom', { n: shown.length })
    return (
      <div key={i}>
        <div className="flex items-baseline gap-2" style={{ marginTop: 16 }}>
          {message.pending && (
            <span style={{ alignSelf: 'center', display: 'inline-flex' }}>
              <OwlGlyph pose="scan" size={15} live />
            </span>
          )}
          <span className="mlabel" style={{ color: 'var(--ac)' }}>
            {t('theOwl')}
          </span>
          <span style={{ font: '400 9px var(--mono)', color: 'var(--muted)' }}>
            {message.pending ? t('owlAnswering') : answeredLabel}
          </span>
        </div>
        <div className="owl-answer">
          <OwlAnswerMarkdown
            text={message.content}
            sources={message.sources}
            onSourceJump={(source) => jumpToThread(source.threadKey, source.mailbox)}
          />
          {message.pending && <StreamCaret />}
        </div>
        {!message.pending &&
          shown.length > 0 &&
          renderSources(shown, retrieved.length - shown.length)}
      </div>
    )
  }

  const renderConversation = (): React.JSX.Element => {
    // Neueste Frage samt Antwort zuoberst: Nachrichten in Frage+Antwort-Blöcke
    // gruppieren und rückwärts rendern — in jedem Block bleibt die Frage über
    // ihrer Antwort, ältere Blöcke rutschen nach unten.
    const exchanges: Array<{ start: number; messages: OwlDraftMessage[] }> = []
    owl.messages.forEach((message, index) => {
      if (message.role === 'user' || exchanges.length === 0) {
        exchanges.push({ start: index, messages: [message] })
      } else {
        exchanges[exchanges.length - 1].messages.push(message)
      }
    })
    return (
      <div style={{ padding: '24px 28px 24px' }}>
        {[...exchanges].reverse().map((exchange, position) => {
          const [question, ...answers] = exchange.messages
          return (
            <div key={exchange.start} style={{ marginTop: position > 0 ? 34 : 0 }}>
              <div style={{ font: '500 21px var(--serif)' }}>{question?.content}</div>
              <div className="mmeta" style={{ letterSpacing: '.5px', marginTop: 5 }}>
                {t('owlYouAsked', { time: rowTime(lang, question?.at ?? null) })}
              </div>
              <div style={{ borderTop: '1px solid var(--ink)', marginTop: 18 }} />
              <div style={{ borderTop: '1px solid var(--ink)', marginTop: 2 }} />
              {answers.map((message, i) => renderTurn(message, exchange.start + 1 + i))}
            </div>
          )
        })}
      </div>
    )
  }

  const renderEmpty = (): React.JSX.Element => (
    <div className="flex h-full flex-col items-center justify-center" style={{ padding: 24 }}>
      <OwlGlyph pose="awake" size={44} accentLeftEye />
      <div
        style={{
          font: 'italic 400 18px var(--serif)',
          color: 'var(--secondary)',
          marginTop: 16
        }}
      >
        {t('chatEmptyTitle')}
      </div>
      <div
        style={{
          font: '400 9px var(--mono)',
          letterSpacing: 1,
          color: 'var(--faint)',
          marginTop: 6
        }}
      >
        {t('owlEmptySub')}
      </div>
      <div className="flex flex-col items-center" style={{ gap: 8, marginTop: 22 }}>
        {SUGGESTION_KEYS.map((key) => (
          <button
            type="button"
            key={key}
            className="owl-chip"
            onClick={() => {
              // Füllt das Feld und fragt — ohne Schlüssel bleibt es beim
              // Befüllen: die Treffer sind lokal, die Frage-Zeile schläft.
              owl.setQuery(t(key))
              useOwl.getState().requestFocus()
              if (!noKey) ask(t(key))
            }}
          >
            {t(key)}
          </button>
        ))}
      </div>
    </div>
  )

  return (
    <div className="sheet-card flex min-w-0 flex-1 flex-col overflow-hidden">
      <div className="owl-input-row">
        <span className="owl-input-row__prompt" aria-hidden="true">
          ›
        </span>
        <textarea
          ref={inputRef}
          rows={1}
          maxLength={2000}
          spellCheck={false}
          value={owl.query}
          placeholder={phase === 'conversation' ? t('owlFollowUpPh') : t('owlInputPh')}
          aria-label={t('cmdOwlSearch')}
          className="owl-input"
          onChange={(e) => {
            owl.setQuery(e.target.value)
            setSelection({ id: null, manual: false })
          }}
          onKeyDown={onInputKeyDown}
        />
        <button
          type="button"
          onClick={() => (dictation.state === 'listening' ? dictation.finish() : dictation.start())}
          className="btn-bare hit-target"
          title={t('voiceQueryStart')}
          aria-label={t('voiceQueryStart')}
          aria-pressed={dictation.state === 'listening'}
          style={{
            font: '500 10px var(--mono)',
            color: dictation.state === 'listening' ? 'var(--ac)' : 'var(--muted)'
          }}
        >
          ◉ ⌘D
        </button>
        {owl.query && <span className="owl-input-row__esc">{t('owlEscClear')}</span>}
      </div>
      <DictationStrip
        state={dictation.state}
        seconds={dictation.seconds}
        bars={dictation.bars}
        onFinish={dictation.finish}
      />
      {owl.askError && <div className="owl-ask-error">{t('chatError', { msg: owl.askError })}</div>}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        {phase === 'typing' && renderHits()}
        {(phase === 'asking' || phase === 'conversation') && renderConversation()}
        {phase === 'empty' && renderEmpty()}
      </div>
      <div className="owl-footer">
        <span>
          <span style={{ color: 'var(--ink)' }}>↑↓</span> {t('owlFooterHits')}
        </span>
        <span>
          <span style={{ color: 'var(--ink)' }}>↵</span> {t('owlFooterOpen')}
        </span>
        <span className="owl-footer__index">{indexStatus}</span>
      </div>
    </div>
  )
}
