import { useQuery } from '@tanstack/react-query'
import { invoke } from '@renderer/lib/ipc'
import { parseVoiceMeta, type VoiceMeta } from '@renderer/features/paper/account-states'

interface Profile {
  languages?: string[]
  formality?: string
  style_notes?: string[]
  greetings?: string[]
  closings?: string[]
}

export function useStyleProfile(accountId: number | null): Profile | null {
  const q = useQuery({
    queryKey: ['styleProfile', accountId],
    queryFn: async () => {
      const scoped = accountId
        ? await invoke('settings:get', { key: `ai.styleProfile.${accountId}` })
        : { value: null }
      const raw = scoped.value ?? (await invoke('settings:get', { key: 'ai.styleProfile' })).value
      if (!raw) return null
      try {
        return JSON.parse(raw) as Profile
      } catch {
        return null
      }
    },
    staleTime: 60_000
  })
  return q.data ?? null
}

/**
 * Frische-Metadaten der Voice-Card (Design 3e): wie viele Antworten die Eule
 * kennt und wann sie zuletzt gelernt hat. Konto-Meta bevorzugt, globales als
 * Fallback (Bestandsdaten aus Trainingsläufen ohne accountId).
 */
export function useStyleMeta(accountId: number): VoiceMeta | null {
  const q = useQuery({
    queryKey: ['styleMeta', accountId],
    queryFn: async () => {
      const scoped = await invoke('settings:get', { key: `ai.styleMeta.${accountId}` })
      const raw = scoped.value ?? (await invoke('settings:get', { key: 'ai.styleMeta' })).value
      return parseVoiceMeta(raw)
    },
    staleTime: 60_000
  })
  return q.data ?? null
}

/** Kurzer Stimm-Tag fürs Composer-/Rail-Label: „Europa — warm · knapp · DE" */
export function useVoiceTag(accountId: number | null, accountName: string | null): string {
  const profile = useStyleProfile(accountId)
  const name = accountName ?? '—'
  if (!profile) return name
  const bits = [
    ...(profile.style_notes ?? []).slice(0, 2),
    (profile.languages ?? []).slice(0, 2).join('/')
  ].filter(Boolean)
  return bits.length > 0 ? `${name} — ${bits.join(' · ')}` : name
}
