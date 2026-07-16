import type { Lang } from '@renderer/i18n/strings'

export type AttachmentKind =
  | 'pdf'
  | 'image'
  | 'document'
  | 'spreadsheet'
  | 'presentation'
  | 'calendar'
  | 'archive'
  | 'audio'
  | 'video'
  | 'text'
  | 'file'

function extensionOf(filename: string | null): string | null {
  const match = filename?.trim().match(/\.([a-z0-9]{1,12})$/i)
  return match?.[1]?.toLowerCase() ?? null
}

export function attachmentKind(mimeType: string | null, filename: string | null): AttachmentKind {
  const mime = (mimeType ?? '').toLowerCase()
  const extension = extensionOf(filename)

  if (mime.includes('pdf') || extension === 'pdf') return 'pdf'
  if (
    mime.startsWith('image/') ||
    ['png', 'jpg', 'jpeg', 'gif', 'webp', 'heic', 'svg'].includes(extension ?? '')
  ) {
    return 'image'
  }
  if (
    mime.includes('spreadsheet') ||
    mime.includes('excel') ||
    ['xls', 'xlsx', 'ods', 'csv'].includes(extension ?? '')
  ) {
    return 'spreadsheet'
  }
  if (
    mime.includes('presentation') ||
    mime.includes('powerpoint') ||
    ['ppt', 'pptx', 'odp'].includes(extension ?? '')
  ) {
    return 'presentation'
  }
  if (
    mime.includes('wordprocessing') ||
    mime.includes('msword') ||
    mime.includes('opendocument.text') ||
    ['doc', 'docx', 'odt', 'rtf'].includes(extension ?? '')
  ) {
    return 'document'
  }
  if (mime.includes('calendar') || extension === 'ics') return 'calendar'
  if (
    mime.includes('zip') ||
    mime.includes('compressed') ||
    ['zip', 'rar', '7z', 'gz', 'tar'].includes(extension ?? '')
  ) {
    return 'archive'
  }
  if (mime.startsWith('audio/')) return 'audio'
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('text/')) return 'text'
  return 'file'
}

const FALLBACK_BADGES: Record<AttachmentKind, string> = {
  pdf: 'PDF',
  image: 'IMG',
  document: 'DOC',
  spreadsheet: 'XLS',
  presentation: 'PPT',
  calendar: 'ICS',
  archive: 'ZIP',
  audio: 'AUD',
  video: 'VID',
  text: 'TXT',
  file: 'FILE'
}

export function attachmentBadge(mimeType: string | null, filename: string | null): string {
  const extension = extensionOf(filename)
  if (extension) return extension.slice(0, 5).toUpperCase()
  return FALLBACK_BADGES[attachmentKind(mimeType, filename)]
}

export function formatAttachmentSize(size: number | null, lang: Lang): string | null {
  if (size === null || !Number.isFinite(size) || size < 0) return null
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = size
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  const maximumFractionDigits = unit > 0 && value < 10 ? 1 : 0
  const formatted = new Intl.NumberFormat(lang === 'de' ? 'de-DE' : 'en-GB', {
    maximumFractionDigits
  }).format(value)
  return `${formatted} ${units[unit]}`
}

export function totalAttachmentSize(sizes: Array<number | null>): number | null {
  const known = sizes.filter(
    (size): size is number => size !== null && Number.isFinite(size) && size >= 0
  )
  if (known.length === 0) return null
  return known.reduce((sum, size) => sum + size, 0)
}
