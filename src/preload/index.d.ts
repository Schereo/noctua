import type { NoctuaApi } from '../shared/ipc-contract'

declare global {
  interface Window {
    noctua: NoctuaApi
  }
}

export {}
