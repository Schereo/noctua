import { describe, expect, it } from 'vitest'
import {
  attachmentBadge,
  attachmentKind,
  formatAttachmentSize,
  totalAttachmentSize
} from '@renderer/lib/attachments'

describe('attachment presentation', () => {
  it('classifies common attachment formats', () => {
    expect(attachmentKind('application/pdf', 'Bescheid.pdf')).toBe('pdf')
    expect(attachmentKind('image/png', 'Foto.png')).toBe('image')
    expect(
      attachmentKind(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Liste.xlsx'
      )
    ).toBe('spreadsheet')
    expect(attachmentKind('application/zip', 'Unterlagen.zip')).toBe('archive')
  })

  it('uses the extension as a compact file stamp and a useful fallback', () => {
    expect(attachmentBadge('application/pdf', 'Bescheid.pdf')).toBe('PDF')
    expect(attachmentBadge('image/png', null)).toBe('IMG')
    expect(attachmentBadge(null, null)).toBe('FILE')
  })

  it('formats byte sizes for the active locale', () => {
    expect(formatAttachmentSize(null, 'de')).toBeNull()
    expect(formatAttachmentSize(0, 'de')).toBe('0 B')
    expect(formatAttachmentSize(1023, 'de')).toBe('1.023 B')
    expect(formatAttachmentSize(1536, 'de')).toBe('1,5 KB')
    expect(formatAttachmentSize(1536, 'en')).toBe('1.5 KB')
    expect(formatAttachmentSize(2 * 1024 * 1024, 'de')).toBe('2 MB')
  })

  it('adds known sizes without treating unknown files as zero-sized', () => {
    expect(totalAttachmentSize([null, null])).toBeNull()
    expect(totalAttachmentSize([1024, null, 2048])).toBe(3072)
  })
})
