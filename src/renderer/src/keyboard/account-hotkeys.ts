export const ACCOUNT_HOTKEY_LIMIT = 9

export function accountHotkeyForIndex(index: number): string | null {
  return index >= 0 && index < ACCOUNT_HOTKEY_LIMIT ? String(index + 1) : null
}

export function accountFilterForHotkey(
  key: string,
  accountIds: readonly number[]
): number | null | undefined {
  if (key === '0') return null
  if (!/^[1-9]$/.test(key)) return undefined
  return accountIds[Number(key) - 1]
}
