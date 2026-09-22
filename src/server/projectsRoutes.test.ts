import { createMemoryProjectStorage } from '../lib/projectStorage';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import express from 'express';
import { mkdtemp, rm, unlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';

import { mountProjectRoutes } from './projectsRoutes';
import { createLocalProjectStore } from '../lib/localProjectStore';
import { createProjectRepository } from '../lib/projectRepository';

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
      assert.deepEqual(Object.keys(listedBody).sort(), ['projects', 'storageInitialized']);
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


test('separate project loading restores images, skips missing files, and saves without reuploading', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'banana-project-load-'));
  try {
    const store = createLocalProjectStore(dir);
    const assets = Object.fromEntries(Array.from({ length: 8 }, (_, index) => {
      const id = `asset-${index}`;
      return [id, { id, mimeType: 'image/png', data: Buffer.alloc(256 * 1024, index).toString('base64') }];
    }));
    const nodes = Object.keys(assets).map((id, index) => ({
      id: `node-${index}`, type: 'imageNode', position: { x: index * 300, y: 0 }, data: { imageAssetId: id },
    }));
    const project = await store.createProject('Many images', { nodes, edges: [], assets });
    const app = express();
    app.use(express.json());
    mountProjectRoutes(app, store);
    await withServer(app, async (baseUrl) => {
      const manifest = await (await fetch(`${baseUrl}/api/projects/${project.id}?assets=separate`)).json() as any;
      assert.deepEqual(manifest.snapshot.assets, {});
      assert.deepEqual(manifest.assetIds.sort(), Object.keys(assets).sort());
      assert.ok(JSON.stringify(manifest).length < 4096);
      const requests: { url: string; method: string }[] = [];
      const repository = createProjectRepository({ fetcher: async (input, init) => {
        requests.push({ url: String(input), method: init?.method ?? 'GET' });
        return await fetch(`${baseUrl}${input}`, init);
      } });
      const loaded = await repository.loadProject(project.id);
      assert.ok(loaded);
      assert.deepEqual(loaded.snapshot, { nodes, edges: [], assets });
      await repository.saveProjectSnapshot(project.id, loaded.snapshot);
      assert.equal(requests.filter((request) => request.method === 'PUT').length, 1);
      assert.equal(requests.filter((request) => request.url.includes('/assets/')).length, 8);

      await unlink(path.join(dir, 'projects', project.id, 'assets', 'asset-0.png'));
      const missingImage = await repository.loadProject(project.id);
      assert.ok(missingImage);
      assert.equal(Object.keys(missingImage.snapshot.assets).length, 7);
      assert.deepEqual(missingImage.snapshot.nodes, nodes);
      assert.equal(await repository.loadProject('missing-project'), null);
      assert.equal((await fetch(`${baseUrl}/api/projects/${project.id}/assets/unknown`)).status, 404);
      assert.equal((await fetch(`${baseUrl}/api/projects/${project.id}/assets/bad%2Fid`)).status, 400);
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});


test('migration uploads images separately, resumes across repository instances, and does not resurrect deleted projects', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'banana-project-migration-'));
  try {
    const store = createLocalProjectStore(dir);
    const storage = createMemoryProjectStorage();
    const project = { id: 'legacy', name: 'Legacy images', createdAt: '2026-09-22T00:00:00Z', updatedAt: '2026-09-22T00:00:00Z' };
    const assets = Object.fromEntries(['a', 'b', 'c', 'd'].map(id => [id, { id, mimeType: 'image/png', data: Buffer.alloc(16 * 1024, id).toString('base64') }]));
    const snapshot = { nodes: Object.keys(assets).map(id => ({ id, type: 'imageNode', position: { x: 0, y: 0 }, data: { imageAssetId: id } })), edges: [], assets };
    await storage.seedIndex([project]);
    await storage.adapter.set('banana-project:legacy', snapshot);
    const app = express();
    // The aggregate snapshot exceeds this cap; every individual asset fits.
    app.use(express.json({ limit: '32kb' }));
    mountProjectRoutes(app, store);
    await withServer(app, async baseUrl => {
      let fail = true;
      const requests: { url: string; bytes: number }[] = [];
      const fetcher: typeof fetch = async (input, init) => {
        const url = String(input);
        requests.push({ url, bytes: Buffer.byteLength(String(init?.body ?? '')) });
        if (fail && url.endsWith('/assets/c')) return new Response(JSON.stringify({ error: 'temporary failure' }), { status: 503 });
        return fetch(`${baseUrl}${url}`, init);
      };
      await assert.rejects(createProjectRepository({ storageAdapter: storage.adapter, fetcher }).listProjects());
      assert.equal((await store.loadProjectIndex()).length, 1);
      fail = false;
      const repository = createProjectRepository({ storageAdapter: storage.adapter, fetcher });
      assert.equal((await repository.listProjects()).length, 1);
      assert.deepEqual((await repository.loadProject(project.id))?.snapshot, snapshot);
      assert.ok(requests.every(request => request.bytes < 32 * 1024));
      assert.equal(requests.filter(request => request.url === '/api/projects/import').length, 1);
      await repository.deleteProject(project.id);
      assert.deepEqual(await createProjectRepository({ storageAdapter: storage.adapter, fetcher }).listProjects(), []);
      // Even a different browser storage with old data cannot undo a deliberate deletion.
      const oldBrowser = createMemoryProjectStorage();
      await oldBrowser.seedLegacyCanvas(snapshot);
      assert.deepEqual(await createProjectRepository({ storageAdapter: oldBrowser.adapter, fetcher }).listProjects(), []);
      assert.equal((await storage.adapter.get('banana-project:legacy') as any).nodes.length, 4);
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
