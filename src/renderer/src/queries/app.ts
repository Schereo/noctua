import { useQuery } from '@tanstack/react-query'
import { invoke } from '@renderer/lib/ipc'

export function useAppVersion() {
  return useQuery({
    queryKey: ['app', 'version'],
    queryFn: () => invoke('app:version', undefined),
    staleTime: Infinity
  })
}
