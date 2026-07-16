import { useEffect, useState } from 'react'
import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { invoke } from '@renderer/lib/ipc'
import type { InvokeOutput } from '@shared/ipc-contract'

export type SemanticSearchResult = InvokeOutput<'search:semantic'>
export type SemanticSearchHit = SemanticSearchResult['hits'][number]
export type SemanticIndexStatus = SemanticSearchResult['index']

export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs)
    return () => window.clearTimeout(timer)
  }, [delayMs, value])

  return debounced
}

export function useSemanticSearch(
  query: string,
  enabled: boolean
): UseQueryResult<SemanticSearchResult> {
  return useQuery({
    queryKey: ['search', 'semantic', query],
    queryFn: () => invoke('search:semantic', { q: query, limit: 8 }),
    enabled: enabled && query.trim().length >= 2,
    staleTime: 30_000
  })
}
