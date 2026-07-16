import { useQuery } from '@tanstack/react-query'
import type { AccountSummary } from '@shared/types'
import { parseSignatureConfig, renderSignatureText, type SignatureConfig } from '@shared/signature'
import { invoke } from '@renderer/lib/ipc'

export interface AccountSignature {
  config: SignatureConfig | null
  text: string
}

export function useAccountSignature(account: AccountSummary | undefined): AccountSignature {
  const signature = useQuery({
    queryKey: ['signature', account?.id],
    queryFn: () => invoke('settings:get', { key: `sig.${account!.id}` }),
    enabled: account !== undefined,
    staleTime: 30_000
  })
  const config = parseSignatureConfig(signature.data?.value)
  return {
    config,
    text: config ? renderSignatureText(config) : (account?.signature?.trim() ?? '')
  }
}
