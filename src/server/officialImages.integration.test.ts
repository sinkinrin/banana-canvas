import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import express from 'express';
import http from 'node:http';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { mountGenerationRoutes } from './generationRoutes';
import { createRuntimeConfigManager } from './runtimeConfig';
import { createRuntimeSettingsStore } from './runtimeSettings';
import { generateOfficialImage } from './providers/openaiImages';
import { createLocalProjectStore } from '../lib/localProjectStore';

const png = 'iVBORw0KGgo=';
test('HTTP client receives a partial image before upstream completion and keeps every result', async () => {
  const config = createRuntimeConfigManager({ OPENAI_IMAGES_API_KEY: 'fixture-only', OPENAI_IMAGES_STREAM: 'true' });
  const upstream = new TransformStream<Uint8Array, Uint8Array>(); const writer = upstream.writable.getWriter(); const encoder = new TextEncoder();
  const app = express(); app.use(express.json());
  mountGenerationRoutes(app, { runtimeConfig: config, providers: {
    generateBananaImage: async () => { throw new Error('Wrong provider'); }, generateImage2Image: async () => { throw new Error('Wrong provider'); },
    generateOfficialImage: input => generateOfficialImage(input, { runtimeConfig: config, fetchImpl: async () => new Response(upstream.readable, { headers: { 'content-type': 'text/event-stream' } }) }),
  } });
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  try {
    const pendingResponse = fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/generate-image`, { method: 'POST', headers: { 'content-type': 'application/json', Accept: 'text/event-stream' }, body: JSON.stringify({ imageModel: 'openai-image2.6-flare', prompt: 'icon', officialImageOptions: { n: 2, partialImages: 1 } }) });
    await writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'image_generation.partial_image', b64_json: png })}\n\n`));
    const response = await pendingResponse; const reader = response.body!.getReader(); const first = new TextDecoder().decode((await reader.read()).value);
    assert.match(first, /image.partial/); assert.doesNotMatch(first, /image.completed/);
    for (const image of [png, 'aW1hZ2U=']) await writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'image_generation.completed', b64_json: image })}\n\n`));
    await writer.close(); let rest = '';
    while (true) { const part = await reader.read(); if (part.done) break; rest += new TextDecoder().decode(part.value); }
    const completed = JSON.parse(rest.split('\n').find(line => line.startsWith('data:'))!.slice(5));
    assert.equal(completed.images.length, 2); assert.equal(completed.imageModel, 'openai-image2.6-flare');
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
test('official secrets stay independent and encrypted-store backed; SVG and GIF survive project reload', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'banana-official-'));
  try {
    const envFilePath = path.join(directory, '.env'); let secrets: Record<string, string> = {};
    const manager = createRuntimeConfigManager({ IMAGE2_API_KEY: 'legacy-fixture', IMAGE2_BASE_URL: 'https://legacy.example/v1' });
    const store = createRuntimeSettingsStore({ envFilePath, baseEnv: { IMAGE2_API_KEY: 'legacy-fixture', IMAGE2_BASE_URL: 'https://legacy.example/v1' }, manager, secretStore: { get: () => secrets, replace: values => { secrets = values as Record<string, string>; } } });
    const snapshot = store.update({ officialImages: { apiKey: 'official-fixture', baseUrl: 'https://api.openai.com/v1', proxyUrl: 'http://127.0.0.1:7890', proxyEnabled: true, stream: true } });
    assert.equal(snapshot.officialImages?.apiKeyConfigured, true); assert.equal(manager.get().image2.apiKey, 'legacy-fixture');
    assert.equal(secrets.OPENAI_IMAGES_API_KEY, 'official-fixture'); assert.ok(!JSON.stringify(snapshot).includes('official-fixture'));
    assert.ok(!(await readFile(envFilePath, 'utf8')).includes('official-fixture'));
    const projects = createLocalProjectStore(directory); const project = await projects.createProject('Official outputs');
    const assets = { svg: { id: 'svg', data: 'PHN2Zy8+', mimeType: 'image/svg+xml' }, gif: { id: 'gif', data: 'R0lGODlh', mimeType: 'image/gif' } };
    for (const asset of Object.values(assets)) await projects.saveProjectAsset(project.id, asset);
    for (const asset of Object.values(assets)) assert.deepEqual(await projects.loadProjectAsset(project.id, asset.id), asset);
    store.update({ officialImages: { clearApiKey: true } }); assert.equal(manager.get().officialImages.apiKey, '');
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('native provider fetch encodes multipart uploads as multipart/form-data', async () => {
  let body = ''; let contentType = '';
  const upstream = http.createServer(async (req, res) => {
    contentType = req.headers['content-type'] ?? '';
    for await (const chunk of req) body += chunk;
    res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ data: [{ b64_json: png }] }));
  });
  upstream.listen(0, '127.0.0.1'); await once(upstream, 'listening');
  try {
    await generateOfficialImage({ requestId: 'multipart', imageModel: 'openai-image2.6-flare', prompt: 'edit', images: [{ data: png, mimeType: 'image/png' }], markupImage: { data: png, mimeType: 'image/png' } }, { connection: { baseUrl: `http://127.0.0.1:${(upstream.address() as AddressInfo).port}/v1`, apiKey: 'fixture', proxyUrl: '', proxyEnabled: false, stream: false, requestTimeoutMs: 10000, organization: '', project: '' } });
    assert.match(contentType, /^multipart\/form-data; boundary=/); assert.match(body, /name="image\[\]"/); assert.match(body, /name="markup"/);
  } finally { upstream.closeAllConnections(); await new Promise<void>(resolve => upstream.close(() => resolve())); }
});
