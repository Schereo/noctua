import { useState } from 'react'
import type { AttachmentInfo, MessageDetail } from '@shared/types'
import { invoke } from '@renderer/lib/ipc'
import { useI18n, useT } from '@renderer/lib/i18n'
import { usePaper } from '@renderer/stores/paper'
import type { StringKey } from '@renderer/i18n/strings'
import {
  attachmentBadge,
  attachmentKind,
  formatAttachmentSize,
  totalAttachmentSize,
  type AttachmentKind
} from '@renderer/lib/attachments'

const KIND_LABELS: Record<AttachmentKind, StringKey> = {
  pdf: 'mailAttachmentTypePdf',
  image: 'mailAttachmentTypeImage',
  document: 'mailAttachmentTypeDocument',
  spreadsheet: 'mailAttachmentTypeSpreadsheet',
  presentation: 'mailAttachmentTypePresentation',
  calendar: 'mailAttachmentTypeCalendar',
  archive: 'mailAttachmentTypeArchive',
  audio: 'mailAttachmentTypeAudio',
  video: 'mailAttachmentTypeVideo',
  text: 'mailAttachmentTypeText',
  file: 'mailAttachmentTypeFile'
}

type AttachmentSaveState = 'idle' | 'saving' | 'saved' | 'error'

function saveLabel(state: AttachmentSaveState, t: ReturnType<typeof useT>): string {
  if (state === 'saving') return t('mailAttachmentSaving')
  if (state === 'saved') return t('mailAttachmentSaved')
  if (state === 'error') return t('mailAttachmentRetry')
  return t('mailAttachmentSave')
}

export function MessageAttachments({
  attachments,
  hasAttachments,
  bodyState
}: {
  attachments: AttachmentInfo[]
  hasAttachments: boolean
  bodyState: MessageDetail['bodyState']
}): React.JSX.Element | null {
  const t = useT()
  const lang = useI18n((state) => state.lang)
  const toastNow = usePaper((state) => state.toastNow)
  const [activeId, setActiveId] = useState<number | null>(null)
  const [states, setStates] = useState<Record<number, AttachmentSaveState>>({})

  const pending = bodyState === 'none' && hasAttachments && attachments.length === 0
  if (!pending && attachments.length === 0) return null

  const totalSize = totalAttachmentSize(attachments.map((attachment) => attachment.size))
  const totalSizeLabel = formatAttachmentSize(totalSize, lang)
  const countLabel =
    attachments.length === 1
      ? t('mailAttachmentOne')
      : t('mailAttachmentMany', { count: attachments.length })
  const sectionLabel = pending ? t('mailAttachmentsLoading') : countLabel

  const save = async (attachment: AttachmentInfo): Promise<void> => {
    if (activeId !== null) return
    const filename = attachment.filename?.trim() || t('mailAttachmentUnknown')
    setActiveId(attachment.id)
    setStates((current) => ({ ...current, [attachment.id]: 'saving' }))
    try {
      const result = await invoke('attachments:save', { attachmentId: attachment.id })
      if (result.savedPath === null) {
        setStates((current) => ({ ...current, [attachment.id]: 'idle' }))
        return
      }
      setStates((current) => ({ ...current, [attachment.id]: 'saved' }))
      toastNow(t('mailAttachmentSavedToast', { filename }))
    } catch {
      setStates((current) => ({ ...current, [attachment.id]: 'error' }))
      toastNow(t('mailAttachmentSaveFailed', { filename }))
    } finally {
      setActiveId(null)
    }
  }

  return (
    <section className="message-attachments" aria-label={sectionLabel}>
      <div className="message-attachments__header">
        <span>{sectionLabel}</span>
        {!pending && totalSizeLabel && (
          <span className="message-attachments__total">
            {t('mailAttachmentsTotal', { size: totalSizeLabel })}
          </span>
        )}
      </div>

      {pending ? (
        <div className="message-attachments__pending" aria-live="polite">
          <span />
          <span />
        </div>
      ) : (
        <ul className="message-attachments__list">
          {attachments.map((attachment) => {
            const filename = attachment.filename?.trim() || t('mailAttachmentUnknown')
            const state = states[attachment.id] ?? 'idle'
            const kind = attachmentKind(attachment.mimeType, attachment.filename)
            const size = formatAttachmentSize(attachment.size, lang)
            const disabled = activeId !== null && activeId !== attachment.id
            return (
              <li className="message-attachment" data-state={state} key={attachment.id}>
                <span className="message-attachment__stamp" aria-hidden="true">
                  {attachmentBadge(attachment.mimeType, attachment.filename)}
                </span>
                <span className="message-attachment__copy">
                  <span className="message-attachment__name" title={filename}>
                    {filename}
                  </span>
                  <span className="message-attachment__meta">
                    <span>{t(KIND_LABELS[kind])}</span>
                    {size && <span>{size}</span>}
                  </span>
                </span>
                <button
                  type="button"
                  className="message-attachment__save"
                  data-state={state}
                  disabled={disabled || state === 'saving'}
                  aria-busy={state === 'saving'}
                  aria-label={t('mailAttachmentSaveAria', { filename })}
                  onClick={() => void save(attachment)}
                >
                  <span className="message-attachment__save-mark" aria-hidden="true">
                    {state === 'saved' ? '✓' : state === 'error' ? '↻' : '↓'}
                  </span>
                  <span aria-live="polite">{saveLabel(state, t)}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
