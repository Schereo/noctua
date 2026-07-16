import { ipcMain, type BrowserWindow } from 'electron'
import {
  invokeContract,
  INVOKE_CHANNELS,
  type IpcHandlers,
  type PushChannel,
  type PushPayload
} from '@shared/ipc-contract'

/**
 * Bindet den IPC-Vertrag an konkrete Handler. Input und Output jedes Aufrufs
 * werden gegen das zod-Schema des Kanals validiert.
 */
export function registerIpcHandlers(handlers: IpcHandlers): void {
  for (const channel of INVOKE_CHANNELS) {
    const spec = invokeContract[channel]
    ipcMain.handle(channel, async (_event, rawInput: unknown) => {
      const input = spec.input.parse(rawInput)
      // TS kann die Korrelation Kanal↔Handler-Signatur über die Map-Iteration
      // nicht verfolgen; der Contract-Typ IpcHandlers stellt sie sicher.
      const result = await (handlers[channel] as (i: unknown) => unknown)(input)
      return spec.output.parse(result)
    })
  }
}

export function pushToWindow<C extends PushChannel>(
  window: BrowserWindow,
  channel: C,
  payload: PushPayload<C>
): void {
  if (window.isDestroyed()) return
  window.webContents.send(channel, payload)
}
