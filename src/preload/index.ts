import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { INVOKE_CHANNELS, PUSH_CHANNELS, type NoctuaApi } from '@shared/ipc-contract'

const invokeChannels: ReadonlySet<string> = new Set(INVOKE_CHANNELS)
const pushChannels: ReadonlySet<string> = new Set(PUSH_CHANNELS)

/**
 * Generische, aber whitelist-geschützte Brücke: Es sind ausschließlich die im
 * IPC-Vertrag deklarierten Kanäle erreichbar. Payload-Validierung passiert
 * main-seitig (der Renderer gilt als weniger vertrauenswürdig).
 */
const api: NoctuaApi = {
  invoke: (channel, input) => {
    if (!invokeChannels.has(channel)) {
      return Promise.reject(new Error(`Unknown IPC channel: ${channel}`))
    }
    return ipcRenderer.invoke(channel, input)
  },
  on: (channel, callback) => {
    if (!pushChannels.has(channel)) {
      throw new Error(`Unknown push channel: ${channel}`)
    }
    const listener = (_event: IpcRendererEvent, payload: unknown): void => {
      callback(payload as Parameters<typeof callback>[0])
    }
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  }
}

contextBridge.exposeInMainWorld('noctua', api)
