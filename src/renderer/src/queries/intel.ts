import { useQuery } from '@tanstack/react-query'
import { invoke } from '@renderer/lib/ipc'

/** Key-Status + aktive Modelle (aus ai:usage — dort liegt beides schon). */
export function useOrKeyStatus() {
  return useQuery({
    queryKey: ['ai', 'usage'],
    queryFn: () => invoke('ai:usage', undefined),
    select: (d) => ({ hasKey: d.hasApiKey }),
    staleTime: 10_000
  })
}

export function useModels() {
  return useQuery({
    queryKey: ['ai', 'usage'],
    queryFn: () => invoke('ai:usage', undefined),
    select: (d) => ({ scanModel: d.triageModel, writeModel: d.draftModel }),
    staleTime: 10_000
  })
}

/** Verfügbarkeit von Apple Intelligence (On-Device-Triage). */
export function useAppleFm() {
  return useQuery({
    queryKey: ['ai', 'appleFm'],
    queryFn: () => invoke('ai:appleFm', undefined),
    staleTime: 30_000,
    retry: false
  })
}

/** Live-Modellliste von OpenRouter (main-seitig gecacht). */
export function useModelCatalog() {
  return useQuery({
    queryKey: ['ai', 'models'],
    queryFn: () => invoke('ai:models', undefined),
    select: (d) => d.models,
    staleTime: 60 * 60 * 1000,
    retry: 1
  })
}
