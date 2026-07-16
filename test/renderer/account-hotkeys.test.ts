import { describe, expect, it } from 'vitest'
import {
  ACCOUNT_HOTKEY_LIMIT,
  accountFilterForHotkey,
  accountHotkeyForIndex
} from '@renderer/keyboard/account-hotkeys'

describe('Postfach-Hotkeys', () => {
  const accountIds = [11, 22, 33, 44, 55, 66, 77, 88, 99, 100]

  it('ordnet 1 bis 9 stabil den ersten neun Postfächern zu', () => {
    expect(accountHotkeyForIndex(0)).toBe('1')
    expect(accountHotkeyForIndex(ACCOUNT_HOTKEY_LIMIT - 1)).toBe('9')
    expect(accountHotkeyForIndex(ACCOUNT_HOTKEY_LIMIT)).toBeNull()
    expect(accountFilterForHotkey('1', accountIds)).toBe(11)
    expect(accountFilterForHotkey('9', accountIds)).toBe(99)
  })

  it('setzt mit 0 explizit auf alle Postfächer zurück', () => {
    expect(accountFilterForHotkey('0', accountIds)).toBeNull()
  })

  it('ignoriert unbekannte oder nicht belegte Tasten', () => {
    expect(accountFilterForHotkey('x', accountIds)).toBeUndefined()
    expect(accountFilterForHotkey('9', [11, 22])).toBeUndefined()
  })
})
