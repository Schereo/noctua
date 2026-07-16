import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { invoke, onPush } from '@renderer/lib/ipc'
import type { InvokeInput } from '@shared/ipc-contract'

export function useAccounts() {
  const queryClient = useQueryClient()
  useEffect(
    () =>
      onPush('sync:state', () => {
        void queryClient.invalidateQueries({ queryKey: ['accounts'] })
      }),
    [queryClient]
  )
  return useQuery({
    queryKey: ['accounts'],
    queryFn: () => invoke('accounts:list', undefined),
    select: (data) => data.accounts
  })
}

export function useAddAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: InvokeInput<'accounts:add'>) => invoke('accounts:add', input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['accounts'] })
      void queryClient.invalidateQueries({ queryKey: ['threads'] })
    }
  })
}

export function useAddMicrosoft() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: InvokeInput<'accounts:addMicrosoft'>) => invoke('accounts:addMicrosoft', input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['accounts'] })
      void queryClient.invalidateQueries({ queryKey: ['threads'] })
    }
  })
}

export function useAddGoogle() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: InvokeInput<'accounts:addGoogle'>) => invoke('accounts:addGoogle', input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['accounts'] })
      void queryClient.invalidateQueries({ queryKey: ['threads'] })
    }
  })
}
