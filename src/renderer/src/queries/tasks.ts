import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { invoke, onPush } from '@renderer/lib/ipc'

export function useTaskInvalidation(): void {
  const queryClient = useQueryClient()
  useEffect(() => {
    const invalidate = (): void => {
      void queryClient.invalidateQueries({ queryKey: ['tasks'] })
    }
    // Jede Task-Mutation pusht tasks:changed aus dem Main-Prozess — so ist der
    // Toggle überall sofort sichtbar, egal von welcher Stelle der invoke kommt.
    const offAnnotated = onPush('ai:annotated', invalidate)
    const offChanged = onPush('tasks:changed', invalidate)
    return () => {
      offAnnotated()
      offChanged()
    }
  }, [queryClient])
}

export function useTasks(status: 'open' | 'done') {
  return useQuery({
    queryKey: ['tasks', status],
    queryFn: () => invoke('tasks:list', { status }),
    staleTime: 5_000
  })
}
