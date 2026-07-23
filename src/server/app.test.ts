import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';

import { createApp } from './app';

test('createApp applies security headers and disables framework disclosure', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'banana-app-security-'));
  const app = createApp({
    dataDir,
    providers: {
      generateBananaImage: async () => 'data:image/png;base64,banana',
      generateImage2Image: async () => 'data:image/png;base64,image2',
    },
  });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = (server.address() as AddressInfo).port;

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/projects`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-security-policy') ?? '', /frame-ancestors 'none'/);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('x-frame-options'), 'DENY');
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('x-powered-by'), null);

    const malformed = await fetch(`http://127.0.0.1:${port}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{invalid',
    });
    assert.equal(malformed.status, 400);
    assert.deepEqual(await malformed.json(), { error: '请求 JSON 格式无效' });

    const missingApi = await fetch(`http://127.0.0.1:${port}/api/not-found`);
    assert.equal(missingApi.status, 404);
    assert.deepEqual(await missingApi.json(), { error: 'API 路径不存在' });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
