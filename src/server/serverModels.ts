import { fetch } from 'undici';
import type { RuntimeConfig } from './runtimeConfig';
import { getImage2DirectAgent, getProxyAgent } from './proxy';

export type ServerModel = { id: string; ownedBy?: string };

export class ModelListError extends Error {
  constructor(public readonly code: string, public readonly upstreamStatus?: number) { super(code); }
}

export function parseServerModels(value: unknown): ServerModel[] {
  if (!value || typeof value !== 'object' || !Array.isArray((value as { data?: unknown }).data)) throw new ModelListError('INVALID_MODEL_LIST');
  const models = new Map<string, ServerModel>();
  for (const entry of (value as { data: unknown[] }).data) {
    if (!entry || typeof entry !== 'object') continue;
    const model = entry as Record<string, unknown>;
    if (typeof model.id !== 'string' || !model.id.trim() || model.id.length > 200) continue;
    const id = model.id.trim();
    models.set(id, { id, ...(typeof model.owned_by === 'string' ? { ownedBy: model.owned_by.slice(0, 200) } : {}) });
  }
  return [...models.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export async function listServerModels(config: RuntimeConfig, signal?: AbortSignal) {
  const { image2, env } = config;
  if (image2.missingKeys.length) throw new ModelListError('MODEL_CONNECTION_MISSING');
  const timeout = AbortSignal.timeout(20_000);
  const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
  const channels = image2.proxyMode === 'proxy' ? ['proxy'] : image2.proxyMode === 'auto' && image2.proxyUrl ? ['direct', 'proxy'] : ['direct'];
  for (const [index, channel] of channels.entries()) {
    try {
      const response = await fetch(`${image2.baseUrl}/models`, {
        method: 'GET', headers: { Authorization: `Bearer ${image2.apiKey}`, Accept: 'application/json' },
        redirect: 'error', signal: requestSignal,
        dispatcher: channel === 'proxy' ? getProxyAgent(image2.proxyUrl, env) : getImage2DirectAgent(env),
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new ModelListError('MODEL_LIST_HTTP_ERROR', response.status);
      }
      const reader = response.body?.getReader();
      if (!reader) throw new ModelListError('INVALID_MODEL_LIST');
      let length = 0;
      const chunks: Uint8Array[] = [];
      try {
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          length += part.value.byteLength;
          if (length > 2 * 1024 * 1024) { await reader.cancel(); throw new ModelListError('MODEL_LIST_TOO_LARGE'); }
          chunks.push(part.value);
        }
      } finally { reader.releaseLock(); }
      requestSignal.throwIfAborted();
      const models = parseServerModels(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      // Only the model catalog leaves this endpoint; never echo upstream error bodies or credentials.
      return models.filter(model => !model.id.includes(image2.apiKey) && !model.ownedBy?.includes(image2.apiKey));
    } catch (error) {
      if (error instanceof ModelListError) throw error;
      if (requestSignal.aborted || index === channels.length - 1) throw new ModelListError('MODEL_LIST_UNAVAILABLE');
    }
  }
  throw new ModelListError('MODEL_LIST_UNAVAILABLE');
}
