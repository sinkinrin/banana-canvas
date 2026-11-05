export async function readServerSentEvents(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: Record<string, unknown>) => void,
  signal?: AbortSignal,
) {
  const reader = body.getReader(); const decoder = new TextDecoder(); let pending = '';
  const dispatch = (block: string) => {
    const data = block.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).replace(/^ /, '')).join('\n');
    if (!data || data === '[DONE]') return;
    const value = JSON.parse(data);
    if (value && typeof value === 'object' && !Array.isArray(value)) onEvent(value);
  };
  try {
    while (true) {
      signal?.throwIfAborted();
      const part = await reader.read();
      pending += part.done ? decoder.decode() : decoder.decode(part.value, { stream: true });
      let boundary: RegExpExecArray | null;
      while ((boundary = /\r?\n\r?\n/.exec(pending))) {
        dispatch(pending.slice(0, boundary.index));
        pending = pending.slice(boundary.index + boundary[0].length);
      }
      if (pending.length > 128 * 1024 * 1024) throw new Error('Image stream event exceeds the supported size');
      if (part.done) { if (pending.trim()) dispatch(pending); break; }
    }
    signal?.throwIfAborted();
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally { reader.releaseLock(); }
}
