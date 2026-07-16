import { beforeEach, describe, expect, it } from 'vitest'
import { usePaper } from '@renderer/stores/paper'

describe('Paper-Store Konto-Filter', () => {
  beforeEach(() => {
    usePaper.setState({ filter: null, selThreadKey: null })
  })

  it.each([
    { label: 'ein bestimmtes Konto', accountId: 23 },
    { label: 'alle Konten', accountId: null }
  ])('löscht die Thread-Auswahl für $label', ({ accountId }) => {
    usePaper.setState({ filter: accountId === null ? 23 : null, selThreadKey: 'thread:alt' })

    usePaper.getState().setFilter(accountId)

    expect(usePaper.getState().filter).toBe(accountId)
    expect(usePaper.getState().selThreadKey).toBeNull()
  })
})
