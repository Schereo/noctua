import type { AiCategory } from '@shared/types'
import type { StringKey } from '@renderer/i18n/strings'

// Pure Tastenlogik des Kategorie-Override-Menüs (Design 3d) — getrennt vom
// Overlay, damit die 1–7/0-Zuordnung und die ↑↓-Auswahl testbar bleiben.

export interface OverrideOption {
  key: string
  category: AiCategory | null
  labelKey: StringKey
}

export const OVERRIDE_OPTIONS: readonly OverrideOption[] = [
  { key: '1', category: 'personal', labelKey: 'catPersonal' },
  { key: '2', category: 'work', labelKey: 'catWork' },
  { key: '3', category: 'newsletter', labelKey: 'catNewsletter' },
  { key: '4', category: 'promotions', labelKey: 'catPromotions' },
  { key: '5', category: 'notifications', labelKey: 'catNotifications' },
  { key: '6', category: 'transactional', labelKey: 'catTransactional' },
  { key: '7', category: 'other', labelKey: 'catOther' },
  { key: '0', category: null, labelKey: 'overrideReset' }
]

/** Option zur gedrückten Taste (1–7 setzt, 0 gibt die Entscheidung zurück an die Eule). */
export function overrideOptionForKey(key: string): OverrideOption | undefined {
  return OVERRIDE_OPTIONS.find((option) => option.key === key)
}

/** ↑↓-Auswahl: bewegt den Index und hält ihn innerhalb der Liste. */
export function moveOverrideSelection(index: number, delta: -1 | 1): number {
  return Math.max(0, Math.min(OVERRIDE_OPTIONS.length - 1, index + delta))
}
