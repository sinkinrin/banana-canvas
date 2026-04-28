import test from 'node:test';
import assert from 'node:assert/strict';

import { createRuntimeConfigManager } from './runtimeConfig';
import { syncRuntimeGlobalProxy } from './runtimeProxy';
import type { FetchInitWithDispatcher } from './proxy';

function createEnv(proxyUrl?: string) {
  return {
    IMAGE2_BASE_URL: 'https://relay.example/v1',
    IMAGE2_API_KEY: 'relay-key',
    IMAGE2_MODEL: 'gpt-image-2',
    IMAGE2_PROXY_MODE: proxyUrl ? 'proxy' : 'direct',
    IMAGE2_HTTPS_PROXY: proxyUrl,
  };
}

test('syncRuntimeGlobalProxy applies initial proxy, swaps changed proxy, and restores direct fetch on removal', async () => {
  const originalFetch = globalThis.fetch;
  const dispatchers: unknown[] = [];
  const directFetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
    dispatchers.push((init as FetchInitWithDispatcher | undefined)?.dispatcher);
    return new Response('{}', { status: 200 });
  };
  const runtimeConfig = createRuntimeConfigManager(createEnv('http://proxy-one.example'));

  try {
    globalThis.fetch = directFetch;

    syncRuntimeGlobalProxy(runtimeConfig, { directFetch });
    await globalThis.fetch('https://relay.example/first');

    const changed = runtimeConfig.reload(createEnv('http://proxy-two.example'));
    assert.equal(changed.ok, true);
    syncRuntimeGlobalProxy(runtimeConfig, { directFetch });
    await globalThis.fetch('https://relay.example/second');

    const removed = runtimeConfig.reload(createEnv());
    assert.equal(removed.ok, true);
    syncRuntimeGlobalProxy(runtimeConfig, { directFetch });

    assert.equal(dispatchers.length, 2);
    assert.ok(dispatchers[0]);
    assert.ok(dispatchers[1]);
    assert.notEqual(dispatchers[0], dispatchers[1]);
    assert.equal(globalThis.fetch, directFetch);

    await globalThis.fetch('https://relay.example/direct');
    assert.deepEqual(dispatchers, [dispatchers[0], dispatchers[1], undefined]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('syncRuntimeGlobalProxy refreshes global proxy dispatcher when hot-reloaded timeout env changes', async () => {
  const originalFetch = globalThis.fetch;
  const dispatchers: unknown[] = [];
  const directFetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
    dispatchers.push((init as FetchInitWithDispatcher | undefined)?.dispatcher);
    return new Response('{}', { status: 200 });
  };
  const runtimeConfig = createRuntimeConfigManager({
    ...createEnv('http://proxy.example'),
    IMAGE2_PROXY_CONNECT_TIMEOUT_MS: '60000',
    IMAGE2_REQUEST_TIMEOUT_MS: '240000',
  });

  try {
    globalThis.fetch = directFetch;

    syncRuntimeGlobalProxy(runtimeConfig, { directFetch });
    await globalThis.fetch('https://relay.example/first');

    const changed = runtimeConfig.reload({
      ...createEnv('http://proxy.example'),
      IMAGE2_PROXY_CONNECT_TIMEOUT_MS: '1000',
      IMAGE2_REQUEST_TIMEOUT_MS: '2000',
    });
    assert.equal(changed.ok, true);
    syncRuntimeGlobalProxy(runtimeConfig, { directFetch });
    await globalThis.fetch('https://relay.example/second');

    assert.equal(dispatchers.length, 2);
    assert.ok(dispatchers[0]);
    assert.ok(dispatchers[1]);
    assert.notEqual(dispatchers[0], dispatchers[1]);
  } finally {
    runtimeConfig.reload(createEnv());
    syncRuntimeGlobalProxy(runtimeConfig, { directFetch });
    globalThis.fetch = originalFetch;
  }
});
