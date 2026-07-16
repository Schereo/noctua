import { useQuery } from '@tanstack/react-query'
import { invoke } from '@renderer/lib/ipc'

/** Gespeicherte Antwort-Entwürfe (ein Entwurf je Thread), jüngste zuerst. */
export function useDrafts() {
  return useQuery({
    queryKey: ['drafts'],
    queryFn: () => invoke('drafts:list', undefined),
    select: (data) => data.drafts,
    staleTime: 10_000
  })
}
