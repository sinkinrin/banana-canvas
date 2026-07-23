import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assertSafeGeneratedImageUrl,
  base64ToBlob,
  buildImage2MultipartRequest,
  extractImage2GeneratedUrl,
  fetchImage2WithNetworkFallback,
  getImage2AttemptPlan,
  parseImage2SseEvents,
  previewResponseBody,
  selectImage2Endpoint,
  toImage2Size,
} from './image2';

const attemptLabels = (attempts: ReturnType<typeof getImage2AttemptPlan>) =>
  attempts.map((attempt) => attempt.label);

test('generated image URL validation blocks credentials and local network targets', async () => {
  await assert.rejects(
    assertSafeGeneratedImageUrl('http://127.0.0.1/private.png', 'https://relay.example'),
    /私有或保留网络|本机地址/
  );
  await assert.rejects(
    assertSafeGeneratedImageUrl('https://user:pass@example.com/image.png', 'https://example.com'),
    /不允许包含凭据/
  );
  assert.equal(
    (await assertSafeGeneratedImageUrl(
      'http://127.0.0.1:8080/generated.png',
      'http://127.0.0.1:8080'
    )).origin,
    'http://127.0.0.1:8080'
  );
});

test('toImage2Size preserves existing aspect and size mapping', () => {
  assert.equal(toImage2Size('16:9', '1K'), '1536x1024');
  assert.equal(toImage2Size('9:16', '1K'), '1024x1536');
  assert.equal(toImage2Size('4:3', '1K'), '1536x1024');
  assert.equal(toImage2Size('3:4', '1K'), '1024x1536');
  assert.equal(toImage2Size('1:1', '512px'), '1024x1024');
  assert.equal(toImage2Size(undefined, undefined), '1024x1024');
});

test('toImage2Size scales Image2 requests by selected image size', () => {
  assert.equal(toImage2Size('1:1', '2K'), '2048x2048');
  assert.equal(toImage2Size('1:1', '4K'), '2816x2816');
  assert.equal(toImage2Size('16:9', '2K'), '3072x2048');
  assert.equal(toImage2Size('16:9', '4K'), '3584x2048');
  assert.equal(toImage2Size('9:16', '4K'), '2048x3584');
});

test('previewResponseBody truncates long relay responses', () => {
  assert.equal(previewResponseBody('a'.repeat(501)), `${'a'.repeat(500)}...`);
});

test('base64ToBlob creates a Blob with the source MIME type', async () => {
  const blob = base64ToBlob({
    data: Buffer.from('image bytes').toString('base64'),
    mimeType: 'image/webp',
  });

  assert.equal(blob.type, 'image/webp');
  assert.equal(await blob.text(), 'image bytes');
});

test('selectImage2Endpoint chooses edit endpoint when references or mask are present', () => {
  assert.equal(selectImage2Endpoint({ baseUrl: 'https://relay.example/v1', referenceCount: 0, hasMask: false }), 'https://relay.example/v1/images/generations');
  assert.equal(selectImage2Endpoint({ baseUrl: 'https://relay.example/v1', referenceCount: 1, hasMask: false }), 'https://relay.example/v1/images/edits');
  assert.equal(selectImage2Endpoint({ baseUrl: 'https://relay.example/v1', referenceCount: 0, hasMask: true }), 'https://relay.example/v1/images/edits');
});

test('getImage2AttemptPlan preserves pre-extraction direct/proxy retry order', () => {
  assert.deepEqual(attemptLabels(getImage2AttemptPlan({ proxyMode: 'auto', hasProxy: true })), ['direct', 'proxy']);
  assert.deepEqual(getImage2AttemptPlan({ proxyMode: 'direct', hasProxy: true }), [{ label: 'direct', useProxy: false }]);
  assert.deepEqual(attemptLabels(getImage2AttemptPlan({ proxyMode: 'proxy', hasProxy: true })), ['proxy', 'direct']);
  assert.deepEqual(getImage2AttemptPlan({ proxyMode: 'proxy', hasProxy: false }), [{ label: 'direct', useProxy: false }]);
});

test('parseImage2SseEvents extracts generated image URLs from streaming events', () => {
  assert.deepEqual(
    parseImage2SseEvents([
      'data: {"type":"response.output_text.delta","delta":"ignored"}',
      'data: {"type":"response.image_generation.completed","image_url":"https://example.test/generated.png"}',
      'data: [DONE]',
    ].join('\n\n')),
    [
      { type: 'response.output_text.delta', delta: 'ignored' },
      { type: 'response.image_generation.completed', image_url: 'https://example.test/generated.png' },
    ]
  );
});

test('extractImage2GeneratedUrl normalizes generated URL and data URL responses', () => {
  assert.equal(
    extractImage2GeneratedUrl({ data: [{ url: '/files/generated.png' }] }, 'https://api.openai.com'),
    'https://api.openai.com/files/generated.png'
  );
  assert.equal(
    extractImage2GeneratedUrl({ data: [{ b64_json: 'abc' }] }, 'https://api.openai.com'),
    'data:image/png;base64,abc'
  );
  assert.equal(
    extractImage2GeneratedUrl({ choices: [{ message: { content: '![image](https://example.test/image.png)' } }] }, 'https://api.openai.com'),
    'https://example.test/image.png'
  );
});

test('buildImage2MultipartRequest includes mask and edit references in request construction', async () => {
  const request = buildImage2MultipartRequest({
    model: 'gpt-image-2',
    prompt: 'replace hat',
    size: '1024x1024',
    responseFormat: 'url',
    outputFormat: 'png',
    outputCompression: 90,
    referenceImages: [{ data: Buffer.from('source').toString('base64'), mimeType: 'image/png' }],
    maskImage: { data: Buffer.from('mask').toString('base64'), mimeType: 'image/png' },
  });

  assert.equal(request.method, 'POST');
  assert.equal(request.endpoint, 'https://api.openai.com/v1/images/edits');
  assert.equal(request.body.get('model'), 'gpt-image-2');
  assert.equal(request.body.get('prompt'), 'replace hat');
  assert.equal(request.body.get('size'), '1024x1024');
  assert.equal(request.body.get('response_format'), 'url');
  assert.equal(request.body.get('output_format'), 'png');
  assert.equal(request.body.get('output_compression'), null);
  assert.equal(request.body.getAll('image').length, 1);
  assert.ok(request.body.get('mask'));
});

test('buildImage2MultipartRequest includes output compression only for jpeg and webp edits', () => {
  for (const outputFormat of ['jpeg', 'webp'] as const) {
    const request = buildImage2MultipartRequest({
      model: 'gpt-image-2',
      prompt: 'compress',
      size: '1024x1024',
      outputFormat,
      outputCompression: 90,
      referenceImages: [{ data: Buffer.from('source').toString('base64'), mimeType: 'image/png' }],
    });

    assert.equal(request.body.get('output_format'), outputFormat);
    assert.equal(request.body.get('output_compression'), '90');
  }
});

test('fetchImage2WithNetworkFallback consumes auto attempt plan through injected fetch without network', async () => {
  const calls: Array<{ label: string; dispatcher: unknown }> = [];
  const proxyDispatcher = { name: 'proxy-dispatcher' };
  const directDispatcher = { name: 'direct-dispatcher' };

  const response = await fetchImage2WithNetworkFallback({
    url: 'https://api.openai.com/v1/images/generations',
    init: { method: 'POST', body: JSON.stringify({ prompt: 'draw' }) },
    attempts: getImage2AttemptPlan({ proxyMode: 'auto', hasProxy: true }),
    fetchImpl: async (_url, init, attempt) => {
      calls.push({ label: attempt.label, dispatcher: init.dispatcher });
      if (attempt.label === 'direct') throw new TypeError('direct failed');
      return new Response(JSON.stringify({ data: [{ b64_json: 'abc' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
    getProxyDispatcher: () => proxyDispatcher,
    getDirectDispatcher: () => directDispatcher,
  });

  assert.equal(response.status, 200);
  assert.deepEqual(calls, [
    { label: 'direct', dispatcher: directDispatcher },
    { label: 'proxy', dispatcher: proxyDispatcher },
  ]);
});

test('fetchImage2WithNetworkFallback consumes proxy attempt plan through injected fetch without network', async () => {
  const calls: Array<{ label: string; dispatcher: unknown }> = [];
  const proxyDispatcher = { name: 'proxy-dispatcher' };
  const directDispatcher = { name: 'direct-dispatcher' };

  const response = await fetchImage2WithNetworkFallback({
    url: 'https://api.openai.com/v1/images/generations',
    init: { method: 'POST', body: JSON.stringify({ prompt: 'draw' }) },
    attempts: getImage2AttemptPlan({ proxyMode: 'proxy', hasProxy: true }),
    fetchImpl: async (_url, init, attempt) => {
      calls.push({ label: attempt.label, dispatcher: init.dispatcher });
      if (attempt.label === 'proxy') throw new TypeError('proxy failed');
      return new Response(JSON.stringify({ data: [{ b64_json: 'abc' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
    getProxyDispatcher: () => proxyDispatcher,
    getDirectDispatcher: () => directDispatcher,
  });

  assert.equal(response.status, 200);
  assert.deepEqual(calls, [
    { label: 'proxy', dispatcher: proxyDispatcher },
    { label: 'direct', dispatcher: directDispatcher },
  ]);
});

test('fetchImage2WithNetworkFallback honors direct-only attempt mode', async () => {
  const directCalls: string[] = [];
  await fetchImage2WithNetworkFallback({
    url: 'https://api.openai.com/v1/images/generations',
    init: { method: 'POST' },
    attempts: getImage2AttemptPlan({ proxyMode: 'direct', hasProxy: true }),
    fetchImpl: async (_url, _init, attempt) => {
      directCalls.push(attempt.label);
      return new Response('{}', { status: 200 });
    },
    getProxyDispatcher: () => ({ name: 'proxy' }),
    getDirectDispatcher: () => ({ name: 'direct' }),
  });

  assert.deepEqual(directCalls, ['direct']);
});

test('generateImage2Image downloads generated image URLs with current global fetch', async () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = {
    IMAGE2_BASE_URL: process.env.IMAGE2_BASE_URL,
    IMAGE2_API_KEY: process.env.IMAGE2_API_KEY,
    IMAGE2_MODEL: process.env.IMAGE2_MODEL,
    IMAGE2_ENDPOINT_TYPE: process.env.IMAGE2_ENDPOINT_TYPE,
    IMAGE2_PROXY_MODE: process.env.IMAGE2_PROXY_MODE,
    IMAGE2_MAX_ATTEMPTS: process.env.IMAGE2_MAX_ATTEMPTS,
    IMAGE2_RETRY_DELAY_MS: process.env.IMAGE2_RETRY_DELAY_MS,
  };

  try {
    process.env.IMAGE2_BASE_URL = 'https://api.openai.com/v1';
    process.env.IMAGE2_API_KEY = 'test-key';
    process.env.IMAGE2_MODEL = 'gpt-image-2';
    process.env.IMAGE2_ENDPOINT_TYPE = 'images';
    process.env.IMAGE2_PROXY_MODE = 'direct';
    process.env.IMAGE2_MAX_ATTEMPTS = '1';
    process.env.IMAGE2_RETRY_DELAY_MS = '1';

    globalThis.fetch = async (input) => {
      assert.equal(String(input), 'https://api.openai.com/v1/images/generations');
      return new Response(JSON.stringify({ data: [{ url: 'https://api.openai.com/generated.png' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };

    const imported = await import(`./image2.ts?global-fetch-${Date.now()}`);

    globalThis.fetch = async (input) => {
      assert.equal(String(input), 'https://api.openai.com/generated.png');
      return new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { 'content-type': 'image/png' },
      });
    };

    const imageUrl = await imported.generateImage2Image({
      requestId: 'global-fetch-test',
      prompt: 'draw',
      images: [],
      image2Options: { responseFormat: 'url' },
    });

    assert.equal(imageUrl, 'data:image/png;base64,AQID');
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
});

test('generateImage2Image reads image2 settings from hot-reloaded runtime config', async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; authorization: string | null; model: string }> = [];

  try {
    globalThis.fetch = async (input, init) => {
      const headers = new Headers(init?.headers);
      const body = JSON.parse(String(init?.body));
      calls.push({
        url: String(input),
        authorization: headers.get('authorization'),
        model: body.model,
      });
      return new Response(JSON.stringify({ data: [{ b64_json: 'abc' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };

    const [{ createRuntimeConfigManager }, imported] = await Promise.all([
      import('../runtimeConfig'),
      import(`./image2.ts?runtime-config-${Date.now()}`),
    ]);
    const runtimeConfig = createRuntimeConfigManager({
      IMAGE2_BASE_URL: 'https://relay-one.example/v1',
      IMAGE2_API_KEY: 'first-key',
      IMAGE2_MODEL: 'gpt-image-2',
      IMAGE2_ENDPOINT_TYPE: 'images',
      IMAGE2_PROXY_MODE: 'direct',
      IMAGE2_MAX_ATTEMPTS: '1',
      IMAGE2_RETRY_DELAY_MS: '1',
    });

    await imported.generateImage2Image({
      requestId: 'runtime-config-first',
      prompt: 'draw',
      images: [],
      image2Options: {},
      runtimeConfig,
    });

    const reload = runtimeConfig.reload({
      IMAGE2_BASE_URL: 'https://relay-two.example/v1',
      IMAGE2_API_KEY: 'second-key',
      IMAGE2_MODEL: 'custom-chat-model',
      IMAGE2_ENDPOINT_TYPE: 'chat',
      IMAGE2_PROXY_MODE: 'direct',
      IMAGE2_MAX_ATTEMPTS: '1',
      IMAGE2_RETRY_DELAY_MS: '1',
    });
    assert.equal(reload.ok, true);

    await imported.generateImage2Image({
      requestId: 'runtime-config-second',
      prompt: 'draw',
      images: [],
      image2Options: {},
      runtimeConfig,
    });

    assert.deepEqual(calls, [
      {
        url: 'https://relay-one.example/v1/images/generations',
        authorization: 'Bearer first-key',
        model: 'gpt-image-2',
      },
      {
        url: 'https://relay-two.example/v1/chat/completions',
        authorization: 'Bearer second-key',
        model: 'custom-chat-model',
      },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('generateImage2Image downloads generated image URLs through the current image2 proxy dispatcher', async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; dispatcher: unknown }> = [];

  try {
    globalThis.fetch = async (input, init) => {
      calls.push({
        url: String(input),
        dispatcher: (init as { dispatcher?: unknown } | undefined)?.dispatcher,
      });
      if (String(input).endsWith('/images/generations')) {
        return new Response(JSON.stringify({ data: [{ url: 'https://relay.example/generated.png' }] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { 'content-type': 'image/png' },
      });
    };

    const [{ createRuntimeConfigManager }, imported] = await Promise.all([
      import('../runtimeConfig'),
      import(`./image2.ts?generated-url-proxy-${Date.now()}`),
    ]);
    const runtimeConfig = createRuntimeConfigManager({
      IMAGE2_BASE_URL: 'https://relay.example/v1',
      IMAGE2_API_KEY: 'relay-key',
      IMAGE2_MODEL: 'gpt-image-2',
      IMAGE2_ENDPOINT_TYPE: 'images',
      IMAGE2_PROXY_MODE: 'proxy',
      IMAGE2_HTTPS_PROXY: 'http://proxy.example',
      IMAGE2_MAX_ATTEMPTS: '1',
      IMAGE2_RETRY_DELAY_MS: '1',
    });

    const imageUrl = await imported.generateImage2Image({
      requestId: 'generated-url-proxy-test',
      prompt: 'draw',
      images: [],
      image2Options: { responseFormat: 'url' },
      runtimeConfig,
    });

    assert.equal(imageUrl, 'data:image/png;base64,AQID');
    assert.deepEqual(calls.map((call) => call.url), [
      'https://relay.example/v1/images/generations',
      'https://relay.example/generated.png',
    ]);
    assert.ok(calls[0].dispatcher);
    assert.ok(calls[1].dispatcher);
    assert.equal(calls[1].dispatcher, calls[0].dispatcher);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('generateImage2Image propagates external cancellation to the active provider fetch', async () => {
  const originalFetch = globalThis.fetch;
  let started!: () => void;
  const fetchStarted = new Promise<void>((resolve) => {
    started = resolve;
  });

  try {
    globalThis.fetch = async (_input, init) => {
      started();
      return await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'));
        }, { once: true });
      });
    };
    const [{ createRuntimeConfigManager }, imported] = await Promise.all([
      import('../runtimeConfig'),
      import(`./image2.ts?abort-${Date.now()}`),
    ]);
    const runtimeConfig = createRuntimeConfigManager({
      IMAGE2_BASE_URL: 'https://relay.example/v1',
      IMAGE2_API_KEY: 'relay-key',
      IMAGE2_MODEL: 'gpt-image-2',
      IMAGE2_ENDPOINT_TYPE: 'images',
      IMAGE2_PROXY_MODE: 'direct',
      IMAGE2_MAX_ATTEMPTS: '1',
    });
    const controller = new AbortController();
    const generation = imported.generateImage2Image({
      requestId: 'abort-test',
      prompt: 'draw',
      images: [],
      image2Options: {},
      runtimeConfig,
      signal: controller.signal,
    });

    await fetchStarted;
    controller.abort(new DOMException('cancelled', 'AbortError'));
    await assert.rejects(generation, (error: unknown) => error instanceof Error && error.name === 'AbortError');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('generateImage2Image rejects generated image downloads above the byte limit', async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async (input) => {
      if (String(input).endsWith('/images/generations')) {
        return new Response(JSON.stringify({ data: [{ url: 'https://relay.example/generated.png' }] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(new Uint8Array([1]), {
        status: 200,
        headers: {
          'content-type': 'image/png',
          'content-length': String(21 * 1024 * 1024),
        },
      });
    };
    const [{ createRuntimeConfigManager }, imported] = await Promise.all([
      import('../runtimeConfig'),
      import(`./image2.ts?size-limit-${Date.now()}`),
    ]);
    const runtimeConfig = createRuntimeConfigManager({
      IMAGE2_BASE_URL: 'https://relay.example/v1',
      IMAGE2_API_KEY: 'relay-key',
      IMAGE2_MODEL: 'gpt-image-2',
      IMAGE2_ENDPOINT_TYPE: 'images',
      IMAGE2_PROXY_MODE: 'direct',
      IMAGE2_MAX_ATTEMPTS: '1',
    });

    await assert.rejects(imported.generateImage2Image({
      requestId: 'size-limit-test',
      prompt: 'draw',
      images: [],
      image2Options: { responseFormat: 'url' },
      runtimeConfig,
    }), /超过 .* 字节限制/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
