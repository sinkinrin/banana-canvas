import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';

import { createLocalPromptStore } from '../lib/localPromptStore';
import { mountPromptRoutes } from './promptsRoutes';

test('prompt routes create, list, edit, and delete templates', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'banana-prompt-routes-'));
  const app = express();
  app.use(express.json());
  mountPromptRoutes(app, createLocalPromptStore(dir));
  const server = app.listen(0);
  await once(server, 'listening');
  const port = (server.address() as AddressInfo).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const createdResponse = await fetch(`${baseUrl}/api/prompts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '', content: '产品摄影提示词', tags: ['摄影'] }),
    });
    assert.equal(createdResponse.status, 200);
    const created = (await createdResponse.json() as any).prompt;
    assert.equal(created.title, '产品摄影提示词');

    const listed = await fetch(`${baseUrl}/api/prompts`);
    assert.equal((await listed.json() as any).prompts.length, 1);

    const edited = await fetch(`${baseUrl}/api/prompts/${created.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '商业产品摄影' }),
    });
    assert.equal((await edited.json() as any).prompt.title, '商业产品摄影');

    const deleted = await fetch(`${baseUrl}/api/prompts/${created.id}`, { method: 'DELETE' });
    assert.deepEqual(await deleted.json(), { ok: true });
    assert.equal((await (await fetch(`${baseUrl}/api/prompts`)).json() as any).prompts.length, 0);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('prompt routes return a bounded validation error for empty content', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'banana-prompt-routes-invalid-'));
  const app = express();
  app.use(express.json());
  mountPromptRoutes(app, createLocalPromptStore(dir));
  const server = app.listen(0);
  await once(server, 'listening');
  const port = (server.address() as AddressInfo).port;
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/prompts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: '', tags: [] }),
    });
    assert.equal(response.status, 400);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
