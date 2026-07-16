import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { invoke, onPush } from '@renderer/lib/ipc'

export function useFollowupInvalidation(): void {
  const queryClient = useQueryClient()
  useEffect(
    () =>
      onPush('followups:changed', () => {
        void queryClient.invalidateQueries({ queryKey: ['followups'] })
      }),
    [queryClient]
  )
}

export function useFollowups() {
  return useQuery({
    queryKey: ['followups'],
    queryFn: () => invoke('followups:list', undefined),
    select: (data) => data.items,
    staleTime: 30_000
  })
}
