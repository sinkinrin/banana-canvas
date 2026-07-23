import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';

import { mountGenerationRoutes, type GenerationProviders } from './generationRoutes';
import { createRuntimeConfigManager } from './runtimeConfig';

async function requestJson(app: express.Express, path: string, body: unknown) {
  const server = app.listen(0);
  await once(server, 'listening');
  const address = server.address();
  assert.equal(typeof address, 'object');
  assert.ok(address);
  const port = (address as AddressInfo).port;

  try {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return {
      status: response.status,
      body: await response.json() as any,
    };
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

function createApp(providers: GenerationProviders) {
  const app = express();
  app.use(express.json({ limit: '50mb' }));
  mountGenerationRoutes(app, {
    providers,
    runtimeConfig: createRuntimeConfigManager({ GEMINI_API_KEY: 'test-key' }),
  });
  return app;
}

function createAppWithRuntimeConfig(providers: GenerationProviders, env: Record<string, string | undefined>) {
  const app = express();
  app.use(express.json({ limit: '50mb' }));
  const runtimeConfig = createRuntimeConfigManager(env);
  mountGenerationRoutes(app, { providers, runtimeConfig });
  return { app, runtimeConfig };
}

test('generate-image returns 400 for validation failures without calling providers', async () => {
  let called = false;
  const app = createApp({
    generateBananaImage: async () => {
      called = true;
      return 'data:image/png;base64,banana';
    },
    generateImage2Image: async () => {
      called = true;
      return 'data:image/png;base64,image2';
    },
    optimizePrompt: async () => 'optimized',
  });

  const response = await requestJson(app, '/api/generate-image', { prompt: 42 });

  assert.equal(response.status, 400);
  assert.equal(response.body.error, 'prompt must be a string');
  assert.equal(called, false);
});

test('generate-image returns provider result for valid Banana request', async () => {
  const app = createApp({
    generateBananaImage: async ({ prompt, images }) => {
      assert.equal(prompt, 'draw');
      assert.equal(images.length, 0);
      return 'data:image/png;base64,banana';
    },
    generateImage2Image: async () => {
      throw new Error('Image2 should not be called');
    },
    optimizePrompt: async () => 'optimized',
  });

  const response = await requestJson(app, '/api/generate-image', {
    prompt: 'draw',
    imageModel: 'banana',
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    imageUrl: 'data:image/png;base64,banana',
    imageModel: 'banana',
  });
});

test('provider failures still return 500 with a request ID', async () => {
  const app = createApp({
    generateBananaImage: async () => {
      throw new Error('provider exploded');
    },
    generateImage2Image: async () => 'data:image/png;base64,image2',
    optimizePrompt: async () => 'optimized',
  });

  const response = await requestJson(app, '/api/generate-image', {
    prompt: 'draw',
    imageModel: 'banana',
  });

  assert.equal(response.status, 500);
  assert.match(response.body.error, /图像生成失败/);
  assert.equal(JSON.stringify(response.body).includes('provider exploded'), false);
  assert.equal(typeof response.body.requestId, 'string');
});

test('optimize-prompt returns stable response shape through injected optimizer without image providers', async () => {
  let imageProviderCalled = false;
  const app = createApp({
    generateBananaImage: async () => {
      imageProviderCalled = true;
      return 'data:image/png;base64,banana';
    },
    generateImage2Image: async () => {
      imageProviderCalled = true;
      return 'data:image/png;base64,image2';
    },
    optimizePrompt: async ({ prompt }) => {
      assert.equal(prompt, 'short prompt');
      return 'expanded prompt';
    },
  });

  const response = await requestJson(app, '/api/optimize-prompt', { prompt: 'short prompt' });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { optimizedPrompt: 'expanded prompt' });
  assert.equal(imageProviderCalled, false);
});

test('generation routes read Gemini API key from hot-reloaded runtime config', async () => {
  const seenKeys: string[] = [];
  const { app, runtimeConfig } = createAppWithRuntimeConfig({
    generateBananaImage: async ({ apiKey }) => {
      seenKeys.push(apiKey);
      return 'data:image/png;base64,banana';
    },
    generateImage2Image: async () => 'data:image/png;base64,image2',
    optimizePrompt: async ({ apiKey }) => {
      seenKeys.push(apiKey);
      return apiKey;
    },
  }, { GEMINI_API_KEY: 'old-key' });

  const first = await requestJson(app, '/api/optimize-prompt', { prompt: 'short prompt' });
  assert.equal(first.status, 200);
  assert.deepEqual(first.body, { optimizedPrompt: 'old-key' });

  const reload = runtimeConfig.reload({ GEMINI_API_KEY: 'new-key' });
  assert.equal(reload.ok, true);

  const second = await requestJson(app, '/api/generate-image', {
    prompt: 'draw',
    imageModel: 'banana',
  });

  assert.equal(second.status, 200);
  assert.deepEqual(seenKeys, ['old-key', 'new-key']);
});

test('generation route aborts the provider when the client disconnects', async () => {
  let providerStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    providerStarted = resolve;
  });
  let providerAborted!: () => void;
  const aborted = new Promise<void>((resolve) => {
    providerAborted = resolve;
  });
  const app = createApp({
    generateBananaImage: async ({ signal }) => {
      providerStarted();
      return await new Promise<string>((_resolve, reject) => {
        signal?.addEventListener('abort', () => {
          providerAborted();
          reject(new DOMException('aborted', 'AbortError'));
        }, { once: true });
      });
    },
    generateImage2Image: async () => 'data:image/png;base64,image2',
  });
  const server = app.listen(0);
  await once(server, 'listening');
  const address = server.address() as AddressInfo;
  const body = JSON.stringify({ prompt: 'draw', imageModel: 'banana' });
  const request = http.request({
    host: '127.0.0.1',
    port: address.port,
    path: '/api/generate-image',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    },
  });
  request.on('error', () => undefined);
  request.end(body);

  try {
    await started;
    request.destroy();
    await aborted;
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
