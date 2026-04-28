import {
  applyGlobalProxyFetch,
  getConfiguredProxyUrl,
  getImage2ProxyMode,
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
  const proxyUrl = getConfiguredProxyUrl(env);

  applyGlobalProxyFetch({ proxyUrl, directFetch, env });

  if (proxyUrl) {
    logger({
      level: 'info',
      message: `[Proxy] Using proxy: ${redactProxyUrl(proxyUrl)} image2Mode=${getImage2ProxyMode(proxyUrl, env)}`,
    });
  } else {
    logger({ level: 'info', message: '[Proxy] Proxy disabled' });
  }
}
