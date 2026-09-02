import test from 'node:test';
import assert from 'node:assert/strict';

import { createRuntimeConfigManager } from './runtimeConfig';
import { syncRuntimeGlobalProxy } from './runtimeProxy';
import type { FetchInitWithDispatcher } from './proxy';
import { generateBananaImage } from './providers/banana';

function createEnv(proxyUrl?: string) {
  return {
    IMAGE2_BASE_URL: 'https://relay.example/v1',
    IMAGE2_API_KEY: 'relay-key',
    IMAGE2_MODEL: 'gpt-image-2',
    IMAGE2_PROXY_MODE: proxyUrl ? 'proxy' : 'direct',
    IMAGE2_HTTPS_PROXY: proxyUrl,
    GEMINI_HTTPS_PROXY: proxyUrl,
    GEMINI_PROXY_ENABLED: proxyUrl ? 'true' : 'false',
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
    await globalThis.fetch('https://generativelanguage.googleapis.com/first');

    const changed = runtimeConfig.reload(createEnv('http://proxy-two.example'));
    assert.equal(changed.ok, true);
    syncRuntimeGlobalProxy(runtimeConfig, { directFetch });
    await globalThis.fetch('https://generativelanguage.googleapis.com/second');

    const removed = runtimeConfig.reload(createEnv());
    assert.equal(removed.ok, true);
    syncRuntimeGlobalProxy(runtimeConfig, { directFetch });

    assert.equal(dispatchers.length, 2);
    assert.ok(dispatchers[0]);
    assert.ok(dispatchers[1]);
    assert.notEqual(dispatchers[0], dispatchers[1]);
    assert.equal(globalThis.fetch, directFetch);

    await globalThis.fetch('https://generativelanguage.googleapis.com/direct');
    assert.deepEqual(dispatchers, [dispatchers[0], dispatchers[1], undefined]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Banana proxy dispatcher stays independent from Image2 timeout hot reloads', async () => {
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
    await globalThis.fetch('https://generativelanguage.googleapis.com/first');

    const changed = runtimeConfig.reload({
      ...createEnv('http://proxy.example'),
      IMAGE2_PROXY_CONNECT_TIMEOUT_MS: '1000',
      IMAGE2_REQUEST_TIMEOUT_MS: '2000',
    });
    assert.equal(changed.ok, true);
    syncRuntimeGlobalProxy(runtimeConfig, { directFetch });
    await globalThis.fetch('https://generativelanguage.googleapis.com/second');

    assert.equal(dispatchers.length, 2);
    assert.ok(dispatchers[0]);
    assert.ok(dispatchers[1]);
    assert.equal(dispatchers[0], dispatchers[1]);
  } finally {
    runtimeConfig.reload(createEnv());
    syncRuntimeGlobalProxy(runtimeConfig, { directFetch });
    globalThis.fetch = originalFetch;
  }
});

test('Banana proxy routing leaves Image2 and local fetches on their own dispatchers', async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; dispatcher: unknown }> = [];
  const directFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: String(input),
      dispatcher: (init as FetchInitWithDispatcher | undefined)?.dispatcher,
    });
    return new Response('{}', { status: 200 });
  };
  const runtimeConfig = createRuntimeConfigManager(createEnv('http://banana-proxy.example'));

  try {
    globalThis.fetch = directFetch;
    syncRuntimeGlobalProxy(runtimeConfig, { directFetch, logger: () => {} });
    await globalThis.fetch('https://generativelanguage.googleapis.com/v1beta/models');
    await globalThis.fetch('https://relay.example/v1/images/generations');
    await globalThis.fetch('http://127.0.0.1:3000/api/prompts');

    assert.ok(calls[0].dispatcher);
    assert.equal(calls[1].dispatcher, undefined);
    assert.equal(calls[2].dispatcher, undefined);
  } finally {
    runtimeConfig.reload(createEnv());
    syncRuntimeGlobalProxy(runtimeConfig, { directFetch, logger: () => {} });
    globalThis.fetch = originalFetch;
  }
});

test('Google GenAI SDK requests use the explicitly enabled Banana proxy', async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; dispatcher: unknown }> = [];
  const directFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: input instanceof Request ? input.url : String(input),
      dispatcher: (init as FetchInitWithDispatcher | undefined)?.dispatcher,
    });
    return new Response(JSON.stringify({
      candidates: [{
        content: {
          role: 'model',
          parts: [{ inlineData: { mimeType: 'image/png', data: 'cG5n' } }],
        },
      }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const runtimeConfig = createRuntimeConfigManager(createEnv('http://banana-proxy.example'));

  try {
    globalThis.fetch = directFetch;
    syncRuntimeGlobalProxy(runtimeConfig, { directFetch, logger: () => {} });
    const imageUrl = await generateBananaImage({
      imageModel: 'banana',
      prompt: 'draw',
      apiKey: 'test-key',
      images: [],
      bananaOptions: {},
    });

    assert.equal(imageUrl, 'data:image/png;base64,cG5n');
    assert.equal(new URL(calls[0].url).hostname, 'generativelanguage.googleapis.com');
    assert.ok(calls[0].dispatcher);
  } finally {
    runtimeConfig.reload(createEnv());
    syncRuntimeGlobalProxy(runtimeConfig, { directFetch, logger: () => {} });
    globalThis.fetch = originalFetch;
  }
});
