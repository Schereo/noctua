import { useMemo, useState } from 'react'
import DOMPurify, { type Config } from 'dompurify'
import { invoke } from '@renderer/lib/ipc'
import { useT } from '@renderer/lib/i18n'

/**
 * Rendert Mail-HTML nach hartem Sanitizing. Verteidigungslinien:
 * DOMPurify (Tags/Attribute/URIs) + Bild-Transform (Remote-Bilder werden
 * geparkt statt geladen — kein einziger Netz-Request ohne Freigabe) +
 * App-CSP + sandboxed Renderer. Links gehen ausschließlich über den
 * Main-Prozess in den System-Browser.
 */
const PURIFY_CONFIG: Config = {
  FORBID_TAGS: [
    'style',
    'form',
    'input',
    'button',
    'iframe',
    'object',
    'embed',
    'svg',
    'math',
    'link',
    'meta',
    'base',
    'video',
    'audio'
  ],
  FORBID_ATTR: ['srcset', 'formaction', 'background', 'poster'],
  ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|cid:|data:image\/)/i
}

function transformImages(
  cleanHtml: string,
  inlineImages: Record<string, string>,
  remoteAllowed: boolean
): { html: string; blockedCount: number } {
  const doc = new DOMParser().parseFromString(cleanHtml, 'text/html')
  let blockedCount = 0
  doc.querySelectorAll('img').forEach((img) => {
    const src = img.getAttribute('src') ?? ''
    if (src.startsWith('cid:')) {
      const dataUri = inlineImages[src.slice(4)]
      if (dataUri) img.setAttribute('src', dataUri)
      else img.removeAttribute('src')
    } else if (/^https?:/i.test(src)) {
      if (!remoteAllowed) {
        img.removeAttribute('src')
        img.setAttribute('data-blocked', '1')
        blockedCount++
      }
    }
  })
  return { html: doc.body.innerHTML, blockedCount }
}

function openLink(event: React.MouseEvent): void {
  const anchor = (event.target as HTMLElement).closest('a')
  if (anchor) {
    event.preventDefault()
    const href = anchor.getAttribute('href')
    if (href) void invoke('app:openExternal', { url: href })
  }
}

export function MailFrame({
  html,
  fromAddr,
  inlineImages,
  remoteImagesAllowed
}: {
  html: string
  fromAddr: string | null
  inlineImages: Record<string, string>
  remoteImagesAllowed: boolean
}): React.JSX.Element {
  const t = useT()
  const [showRemote, setShowRemote] = useState(false)
  const [allowedPermanently, setAllowedPermanently] = useState(false)
  const remoteAllowed = remoteImagesAllowed || showRemote || allowedPermanently

  const { html: rendered, blockedCount } = useMemo(() => {
    const clean = String(DOMPurify.sanitize(html, PURIFY_CONFIG))
    return transformImages(clean, inlineImages, remoteAllowed)
  }, [html, inlineImages, remoteAllowed])

  const allowSenderPermanently = async (): Promise<void> => {
    if (fromAddr) {
      await invoke('images:allowSender', { addr: fromAddr, allow: true })
      setAllowedPermanently(true)
    }
  }

  return (
    <div>
      {blockedCount > 0 && (
        <div className="anim-rise mb-2 flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-[11.5px] text-text-faint">
          <span>
            {blockedCount === 1
              ? t('remoteImagesBlockedOne')
              : t('remoteImagesBlocked', { n: blockedCount })}
          </span>
          <button
            onClick={() => setShowRemote(true)}
            className="rounded border border-border px-1.5 py-0.5 text-text-muted hover:bg-surface-3"
          >
            {t('remoteImagesShow')}
          </button>
          {fromAddr && (
            <button
              onClick={() => void allowSenderPermanently()}
              className="rounded border border-border px-1.5 py-0.5 text-text-muted hover:bg-surface-3"
            >
              {t('remoteImagesAllowSender', { addr: fromAddr })}
            </button>
          )}
        </div>
      )}
      <div
        className="mail-html select-text overflow-x-hidden rounded-lg bg-mail-surface px-5 py-4 text-[14px] leading-relaxed text-mail-text shadow-[inset_0_0_0_1px_var(--border)] [&_a]:text-blue-700 [&_a]:underline [&_img]:h-auto [&_img]:max-w-full [&_img[data-blocked]]:inline-block [&_img[data-blocked]]:min-h-6 [&_img[data-blocked]]:min-w-6 [&_img[data-blocked]]:rounded [&_img[data-blocked]]:border [&_img[data-blocked]]:border-dashed [&_img[data-blocked]]:border-neutral-300 [&_img[data-blocked]]:bg-neutral-100 [&_table]:max-w-full"
        onClick={openLink}
        // Mail-Clients begrenzen Bodys auf ~640-700px — sonst wachsen
        // Newsletter-Bilder auf Sheet-Breite und wirken riesig.
        style={{ maxWidth: 680, margin: '0 auto' }}
        dangerouslySetInnerHTML={{ __html: rendered }}
      />
    </div>
  )
}

export function PlainTextBody({ text }: { text: string }): React.JSX.Element {
  const parts = text.split(/(https?:\/\/[^\s<>"]+)/g)
  return (
    <div
      className="select-text whitespace-pre-wrap px-1 py-2 text-[14px] leading-relaxed text-text"
      onClick={openLink}
    >
      {parts.map((part, index) =>
        /^https?:\/\//.test(part) ? (
          <a key={index} href={part} className="text-accent underline">
            {part}
          </a>
        ) : (
          <span key={index}>{part}</span>
        )
      )}
    </div>
  )
}
