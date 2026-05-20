import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import express from 'express';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';

import { mountProjectRoutes } from './projectsRoutes';
import { createLocalProjectStore } from '../lib/localProjectStore';

async function withServer(app: express.Express, run: (baseUrl: string) => Promise<void>) {
  const server = app.listen(0);
  await once(server, 'listening');
  const address = server.address();
  assert.equal(typeof address, 'object');
  assert.ok(address);
  const port = (address as AddressInfo).port;

  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test('project routes create, rename, save, load, import, list, delete, and return stable shapes', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'banana-project-routes-'));
  try {
    const app = express();
    app.use(express.json({ limit: '50mb' }));
    mountProjectRoutes(app, createLocalProjectStore(dir));

    await withServer(app, async (baseUrl) => {
      const created = await fetch(`${baseUrl}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: ' First ', snapshot: { nodes: [], edges: [], assets: {} } }),
      });
      assert.equal(created.status, 200);
      const createdBody = await created.json() as any;
      assert.deepEqual(Object.keys(createdBody).sort(), ['project']);
      assert.equal(createdBody.project.name, 'First');
      assert.equal(typeof createdBody.project.id, 'string');

      const listed = await fetch(`${baseUrl}/api/projects`);
      assert.equal(listed.status, 200);
      const listedBody = await listed.json() as any;
      assert.deepEqual(Object.keys(listedBody).sort(), ['projects']);
      assert.ok(Array.isArray(listedBody.projects));
      assert.equal(listedBody.projects[0].id, createdBody.project.id);

      const renamed = await fetch(`${baseUrl}/api/projects/${createdBody.project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: ' Renamed ' }),
      });
      assert.equal(renamed.status, 200);
      const renamedBody = await renamed.json() as any;
      assert.deepEqual(Object.keys(renamedBody).sort(), ['project']);
      assert.equal(renamedBody.project.name, 'Renamed');

      const saved = await fetch(`${baseUrl}/api/projects/${createdBody.project.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nodes: [{ id: 'node-1', type: 'promptNode', position: { x: 0, y: 0 }, data: { prompt: 'draw' } }],
          edges: [],
          assets: {},
        }),
      });
      assert.equal(saved.status, 200);
      assert.deepEqual(await saved.json(), { ok: true });

      const loaded = await fetch(`${baseUrl}/api/projects/${createdBody.project.id}`);
      assert.equal(loaded.status, 200);
      const loadedBody = await loaded.json() as any;
      assert.deepEqual(Object.keys(loadedBody).sort(), ['project', 'snapshot']);
      assert.equal(loadedBody.project.name, 'Renamed');
      assert.equal(loadedBody.snapshot.nodes[0].id, 'node-1');

      const imported = await fetch(`${baseUrl}/api/projects/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projects: [{
            project: {
              id: 'imported-project',
              name: 'Imported',
              createdAt: '2026-04-27T00:00:00.000Z',
              updatedAt: '2026-04-27T00:00:00.000Z',
            },
            snapshot: { nodes: [], edges: [], assets: {} },
          }],
        }),
      });
      assert.equal(imported.status, 200);
      assert.deepEqual(await imported.json(), { ok: true });

      const listAfterImport = await fetch(`${baseUrl}/api/projects`);
      assert.equal(listAfterImport.status, 200);
      const listAfterImportBody = await listAfterImport.json() as any;
      assert.equal(listAfterImportBody.projects.some((project: any) => project.id === 'imported-project'), true);

      const deleted = await fetch(`${baseUrl}/api/projects/${createdBody.project.id}`, { method: 'DELETE' });
      assert.equal(deleted.status, 200);
      assert.deepEqual(await deleted.json(), { ok: true });

      const missing = await fetch(`${baseUrl}/api/projects/${createdBody.project.id}`);
      assert.equal(missing.status, 404);
      assert.deepEqual(await missing.json(), { error: '项目不存在' });
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('project routes save assets separately before lightweight snapshots reference them', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'banana-project-routes-'));
  try {
    const app = express();
    app.use(express.json({ limit: '50mb' }));
    mountProjectRoutes(app, createLocalProjectStore(dir));

    await withServer(app, async (baseUrl) => {
      const created = await fetch(`${baseUrl}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Assets', snapshot: { nodes: [], edges: [], assets: {} } }),
      });
      const createdBody = await created.json() as any;
      const projectId = createdBody.project.id;
      const assetData = Buffer.from('separate-asset').toString('base64');

      const uploaded = await fetch(`${baseUrl}/api/projects/${projectId}/assets/asset-png`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          asset: {
            id: 'asset-png',
            mimeType: 'image/png',
            data: assetData,
          },
        }),
      });
      assert.equal(uploaded.status, 200);
      assert.deepEqual(await uploaded.json(), { ok: true });

      const saved = await fetch(`${baseUrl}/api/projects/${projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nodes: [
            {
              id: 'image-1',
              type: 'imageNode',
              position: { x: 0, y: 0 },
              data: { imageAssetId: 'asset-png' },
            },
          ],
          edges: [],
          assets: {},
        }),
      });
      assert.equal(saved.status, 200);

      const loaded = await fetch(`${baseUrl}/api/projects/${projectId}`);
      const loadedBody = await loaded.json() as any;

      assert.equal(loadedBody.snapshot.assets['asset-png'].data, assetData);
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('project routes reject lightweight snapshots when asset refs do not match stored files', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'banana-project-routes-'));
  try {
    const app = express();
    app.use(express.json({ limit: '50mb' }));
    mountProjectRoutes(app, createLocalProjectStore(dir));

    await withServer(app, async (baseUrl) => {
      const created = await fetch(`${baseUrl}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Assets', snapshot: { nodes: [], edges: [], assets: {} } }),
      });
      const createdBody = await created.json() as any;
      const projectId = createdBody.project.id;

      await fetch(`${baseUrl}/api/projects/${projectId}/assets/asset-png`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          asset: {
            id: 'asset-png',
            mimeType: 'image/png',
            data: Buffer.from('actual-asset').toString('base64'),
          },
        }),
      });

      const saved = await fetch(`${baseUrl}/api/projects/${projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nodes: [
            {
              id: 'image-1',
              type: 'imageNode',
              position: { x: 0, y: 0 },
              data: { imageAssetId: 'asset-png' },
            },
          ],
          edges: [],
          assets: {},
          assetRefs: {
            'asset-png': {
              id: 'asset-png',
              mimeType: 'image/png',
              byteLength: Buffer.byteLength('expected-asset'),
              sha256: createHash('sha256').update('expected-asset').digest('hex'),
            },
          },
        }),
      });

      assert.equal(saved.status, 400);
      const body = await saved.json() as any;
      assert.match(body.error, /Project asset mismatch: asset-png/);
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
