import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { createRuntimeConfigManager, loadRuntimeEnvFile } from './runtimeConfig';
import { createRuntimeSettingsStore, mountRuntimeSettingsRoutes, type RuntimeSettingsSecretValues } from './runtimeSettings';
import { mountGenerationRoutes } from './generationRoutes';
import { generateBananaImage } from './providers/banana';

test('settings API switches real SDK generation and optimization, preserves separate credentials, and survives reload', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'banana-provider-'));
  const envFilePath = path.join(dir, '.env');
  let secrets: RuntimeSettingsSecretValues = {};
  const secretStore = { get: () => ({ ...secrets }), replace: (values: RuntimeSettingsSecretValues) => { secrets = { ...values }; } };
  const manager = createRuntimeConfigManager({}, { logger: () => {} });
  const store = createRuntimeSettingsStore({ envFilePath, baseEnv: {}, manager, secretStore });
  const app = express();
  app.use(express.json());
  const calls: Array<{ url: string; key: string | undefined }> = [];
  app.post('/upstream/*', (req, res) => {
    if (req.body.contents?.[0]?.role !== 'user') {
      res.status(400).json({ error: { message: 'Please use a valid role: user, model.' } });
      return;
    }
    calls.push({ url: req.path, key: req.get('x-goog-api-key') });
    res.json({ candidates: [{ content: { parts: req.path.includes('optimizer')
      ? [{ text: 'optimized fixture' }]
      : [{ inlineData: { mimeType: 'image/png', data: 'cG5n' } }] } }] });
  });
  mountRuntimeSettingsRoutes(app, store);
  mountGenerationRoutes(app, { runtimeConfig: manager, providers: {
    generateBananaImage, generateImage2Image: async () => { throw new Error('Unexpected Image2 request'); },
  } });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const request = async (url: string, body: unknown, method = 'POST') => {
    const res = await fetch(base + url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    return { status: res.status, body: await res.json() as any };
  };
  const save = (gemini: unknown) => request('/api/runtime-settings', { gemini }, 'PUT');
  try {
    assert.equal((await save({
      apiKey: 'fixture-studio-key', baseUrl: `${base}/upstream/studio/v1beta`,
      vertexApiKey: 'fixture-vertex-key', vertexBaseUrl: `${base}/upstream/vertex/v1`,
      promptOptimizerModel: 'fixture-optimizer',
    })).status, 200);
    for (const provider of ['ai-studio', 'vertex-ai', 'ai-studio'] as const) {
      const saved = await save({ provider });
      assert.equal(saved.status, 200);
      assert.equal(saved.body.gemini.provider, provider);
      assert.equal(saved.body.gemini.apiKeyConfigured, true);
      assert.equal(saved.body.gemini.vertexApiKeyConfigured, true);
      assert.doesNotMatch(JSON.stringify(saved.body), /fixture-(studio|vertex)-key/);
      const image = await request('/api/generate-image', { prompt: 'draw', imageModel: 'banana-2.1' });
      assert.equal(image.status, 200);
      assert.equal(image.body.imageUrl, 'data:image/png;base64,cG5n');
      const optimized = await request('/api/optimize-prompt', { prompt: 'short' });
      assert.equal(optimized.status, 200);
      assert.equal(optimized.body.optimizedPrompt, 'optimized fixture');
      const prefix = provider === 'ai-studio' ? '/upstream/studio/v1beta/models/' : '/upstream/vertex/v1/publishers/google/models/';
      const key = provider === 'ai-studio' ? 'fixture-studio-key' : 'fixture-vertex-key';
      assert.deepEqual(calls.slice(-2), [
        { url: `${prefix}gemini-nano-banana-2.1:generateContent`, key },
        { url: `${prefix}fixture-optimizer:generateContent`, key },
      ]);
    }
    for (const invalid of [
      { provider: 'unknown' }, { vertexAuthMode: 'unknown' },
      { vertexBaseUrl: 'ftp://example.com' }, { baseUrl: 'https://example.com?key=bad' },
      { vertexProject: '../bad' },
    ]) {
      assert.equal((await save(invalid)).status, 400);
      assert.equal(manager.get().geminiConnection.provider, 'ai-studio');
    }
    await save({ provider: 'vertex-ai', vertexAuthMode: 'adc', vertexProject: 'test-project', vertexLocation: 'us-central1' });
    const restarted = createRuntimeConfigManager({ ...loadRuntimeEnvFile(envFilePath, {}), ...secrets });
    assert.deepEqual(restarted.get().geminiConnection, manager.get().geminiConnection);
    assert.doesNotMatch(fs.readFileSync(envFilePath, 'utf8'), /fixture-(studio|vertex)-key|VERTEX_API_KEY|GEMINI_API_KEY/);
    await save({ vertexAuthMode: 'api-key', clearVertexApiKey: true });
    const denied = await request('/api/generate-image', { prompt: 'draw', imageModel: 'banana' });
    assert.equal(denied.status, 401);
    assert.match(denied.body.error, /Vertex AI/);
    assert.equal(secrets.GEMINI_API_KEY, 'fixture-studio-key');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
