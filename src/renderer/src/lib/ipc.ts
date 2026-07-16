import type {
  InvokeChannel,
  InvokeInput,
  InvokeOutput,
  PushChannel,
  PushPayload
} from '@shared/ipc-contract'

/** Dünner, typisierter Zugriff auf die Preload-Brücke. */
export function invoke<C extends InvokeChannel>(
  channel: C,
  input: InvokeInput<C>
): Promise<InvokeOutput<C>> {
  return window.noctua.invoke(channel, input)
}

export function onPush<C extends PushChannel>(
  channel: C,
  callback: (payload: PushPayload<C>) => void
): () => void {
  return window.noctua.on(channel, callback)
}
