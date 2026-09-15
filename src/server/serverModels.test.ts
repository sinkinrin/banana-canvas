import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { createRuntimeConfigManager } from './runtimeConfig';
import { listServerModels, ModelListError, parseServerModels } from './serverModels';
import { mountRuntimeSettingsRoutes } from './runtimeSettings';

test('standard model catalogs are sorted, deduplicated and restricted to public fields', () => {
  assert.deepEqual(parseServerModels({ data: [{ id: 'z', owned_by: 'openai', api_key: 'secret' }, { id: 'a' }, { id: 'z', owned_by: 'openai' }, null, { id: 123 }] }), [{ id: 'a' }, { id: 'z', ownedBy: 'openai' }]);
  assert.deepEqual(parseServerModels({ data: [] }), []);
  assert.throws(() => parseServerModels({ models: [] }), ModelListError);
});

test('model-list route uses the saved server key and hides upstream credentials and errors', async () => {
  let mode = 'success';
  let hits = 0;
  const upstream = http.createServer((req, res) => {
    hits++;
    assert.equal(req.url, '/v1/models');
    assert.equal(req.headers.authorization, 'Bearer model-list-secret');
    if (mode === 'redirect') { res.writeHead(302, { location: '/other' }); res.end(); return; }
    if (mode === 'error') { res.writeHead(401); res.end('invalid model-list-secret'); return; }
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ data: [{ id: 'gpt-image-2.5-flare', owned_by: 'openai' }, { id: 'text-model' }] }));
  });
  upstream.listen(0, '127.0.0.1'); await once(upstream, 'listening');
  const manager = createRuntimeConfigManager({ IMAGE2_BASE_URL: `http://127.0.0.1:${(upstream.address() as AddressInfo).port}/v1`, IMAGE2_API_KEY: 'model-list-secret', IMAGE2_PROXY_MODE: 'direct' });
  const app = express();
  mountRuntimeSettingsRoutes(app, { get: () => { throw new Error('unused'); }, update: () => { throw new Error('unused'); }, listModels: signal => listServerModels(manager.get(), signal) });
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/runtime-settings/models`;
  try {
    let response = await fetch(url);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { models: [{ id: 'gpt-image-2.5-flare', ownedBy: 'openai' }, { id: 'text-model' }] });
    mode = 'error'; response = await fetch(url);
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), { code: 'MODEL_LIST_HTTP_ERROR', upstreamStatus: 401 });
    mode = 'redirect'; response = await fetch(url);
    assert.equal(response.status, 502);
    assert.ok(!(await response.text()).includes('model-list-secret'));
    assert.equal(hits, 3);
    await assert.rejects(listServerModels(manager.get(), AbortSignal.abort()), /MODEL_LIST_UNAVAILABLE/);
  } finally {
    await Promise.all([server, upstream].map(listener => new Promise<void>(resolve => { listener.close(() => resolve()); listener.closeAllConnections(); })));
  }
});
