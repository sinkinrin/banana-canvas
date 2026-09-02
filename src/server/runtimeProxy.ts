import {
  applyGlobalProxyFetch,
  getGeminiProxyAgent,
  redactProxyUrl,
} from './proxy';
import type { RuntimeConfigLogger, RuntimeConfigManager } from './runtimeConfig';

function defaultLogger({ level, message }: { level: 'info' | 'warn' | 'error'; message: string }) {
  if (level === 'error') {
    console.error(message);
  } else if (level === 'warn') {
    console.warn(message);
  } else {
    console.info(message);
  }
}

export function syncRuntimeGlobalProxy(
  runtimeConfig: RuntimeConfigManager,
  {
    directFetch,
    logger = defaultLogger,
  }: {
    directFetch?: typeof fetch;
    logger?: RuntimeConfigLogger;
  } = {}
) {
  const env = runtimeConfig.get().env;
  const config = runtimeConfig.get();
  const proxyUrl = config.geminiProxyEnabled ? config.geminiProxyUrl : '';

  applyGlobalProxyFetch({
    proxyUrl,
    directFetch,
    env,
    getProxyDispatcher: () => getGeminiProxyAgent(proxyUrl),
    shouldProxyRequest: (input) => {
      try {
        const url = new URL(input instanceof Request ? input.url : String(input));
        return url.hostname === 'generativelanguage.googleapis.com';
      } catch {
        return false;
      }
    },
  });

  if (proxyUrl) {
    logger({
      level: 'info',
      message: `[Proxy] Banana/Gemini proxy enabled: ${redactProxyUrl(proxyUrl)}`,
    });
  } else {
    logger({ level: 'info', message: '[Proxy] Banana/Gemini proxy disabled' });
  }
}
