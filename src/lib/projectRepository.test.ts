import test from 'node:test';
import assert from 'node:assert/strict';

import { createMemoryProjectStorage } from './projectStorage';
import { createProjectRepository } from './projectRepository';

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
  } as Response;
}

test('project repository lists projects from the local API when available', async () => {
  const fetchCalls: string[] = [];
  const fetcher = async (input: RequestInfo | URL) => {
    fetchCalls.push(String(input));
    return jsonResponse({
      projects: [
        {
          id: 'p-local',
          name: '本地项目',
          createdAt: '2026-04-25T10:00:00.000Z',
          updatedAt: '2026-04-25T10:00:00.000Z',
        },
      ],
    });
  };

  const repository = createProjectRepository({ fetcher });
  const projects = await repository.listProjects();

  assert.equal(fetchCalls[0], '/api/projects');
  assert.equal(projects[0].id, 'p-local');
});

test('project repository falls back to IndexedDB storage when local API is unavailable', async () => {
  const storage = createMemoryProjectStorage();
  await storage.seedIndex([
    {
      id: 'p-idb',
      name: 'IndexedDB 项目',
      createdAt: '2026-04-25T10:00:00.000Z',
      updatedAt: '2026-04-25T10:00:00.000Z',
    },
  ]);

  const repository = createProjectRepository({
    storageAdapter: storage.adapter,
    fetcher: async () => {
      throw new Error('network down');
    },
  });

  const projects = await repository.listProjects();

  assert.equal(projects[0].id, 'p-idb');
});

test('project repository surfaces local API storage errors instead of falling back', async () => {
  const storage = createMemoryProjectStorage();
  await storage.seedIndex([
    {
      id: 'p-idb',
      name: 'IndexedDB 项目',
      createdAt: '2026-04-25T10:00:00.000Z',
      updatedAt: '2026-04-25T10:00:00.000Z',
    },
  ]);

  const repository = createProjectRepository({
    storageAdapter: storage.adapter,
    fetcher: async () => jsonResponse({ error: '本地项目存储失败' }, 500),
  });

  await assert.rejects(
    () => repository.listProjects(),
    /本地项目存储失败/
  );
});

test('project repository migrates IndexedDB projects into an empty local file store', async () => {
  const storage = createMemoryProjectStorage();
  await storage.seedIndex([
    {
      id: 'p-old',
      name: '旧项目',
      createdAt: '2026-04-25T10:00:00.000Z',
      updatedAt: '2026-04-25T10:00:00.000Z',
    },
  ]);
  await storage.adapter.set('banana-project:p-old', {
    nodes: [
      {
        id: 'n1',
        type: 'promptNode',
        position: { x: 0, y: 0 },
        data: { prompt: 'banana' },
      },
    ],
    edges: [],
    assets: {},
  });

  const imports: unknown[] = [];
  let migrated = false;
  const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === '/api/projects' && !init) {
      return jsonResponse({
        projects: migrated
          ? [
              {
                id: 'p-old',
                name: '旧项目',
                createdAt: '2026-04-25T10:00:00.000Z',
                updatedAt: '2026-04-25T10:00:00.000Z',
              },
            ]
          : [],
      });
    }
    if (url === '/api/projects/import') {
      imports.push(JSON.parse(String(init?.body)));
      migrated = true;
      return jsonResponse({ ok: true });
    }
    throw new Error(`unexpected request ${url}`);
  };

  const repository = createProjectRepository({ storageAdapter: storage.adapter, fetcher });
  const projects = await repository.listProjects();

  assert.equal(projects[0].id, 'p-old');
  assert.deepEqual(imports, [
    {
      projects: [
        {
          project: {
            id: 'p-old',
            name: '旧项目',
            createdAt: '2026-04-25T10:00:00.000Z',
            updatedAt: '2026-04-25T10:00:00.000Z',
          },
          snapshot: {
            nodes: [
              {
                id: 'n1',
                type: 'promptNode',
                position: { x: 0, y: 0 },
                data: { prompt: 'banana' },
              },
            ],
            edges: [],
            assets: {},
          },
        },
      ],
    },
  ]);
});

test('project repository uploads changed local assets separately from snapshot metadata', async () => {
  const assetData = Buffer.from('new-image').toString('base64');
  const uploads: unknown[] = [];
  const savedSnapshots: unknown[] = [];
  let listed = false;

  const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === '/api/projects' && !init) {
      listed = true;
      return jsonResponse({
        projects: [{
          id: 'p-local',
          name: '本地项目',
          createdAt: '2026-04-25T10:00:00.000Z',
          updatedAt: '2026-04-25T10:00:00.000Z',
        }],
      });
    }

    if (url === '/api/projects/p-local/assets/asset-new') {
      uploads.push(JSON.parse(String(init?.body)));
      return jsonResponse({ ok: true });
    }

    if (url === '/api/projects/p-local') {
      savedSnapshots.push(JSON.parse(String(init?.body)));
      return jsonResponse({ ok: true });
    }

    throw new Error(`unexpected request ${url}`);
  };

  const repository = createProjectRepository({ fetcher });
  const snapshot = {
    nodes: [
      {
        id: 'image-1',
        type: 'imageNode',
        position: { x: 0, y: 0 },
        data: { imageAssetId: 'asset-new' },
      },
    ],
    edges: [],
    assets: {
      'asset-new': {
        id: 'asset-new',
        mimeType: 'image/png',
        data: assetData,
      },
    },
  };

  await repository.saveProjectSnapshot('p-local', snapshot);
  await repository.saveProjectSnapshot('p-local', {
    ...snapshot,
    nodes: [
      {
        ...snapshot.nodes[0],
        position: { x: 20, y: 30 },
      },
    ],
  });

  assert.equal(listed, true);
  assert.deepEqual(uploads, [{
    asset: {
      id: 'asset-new',
      mimeType: 'image/png',
      data: assetData,
    },
  }]);
  assert.equal(savedSnapshots.length, 2);
  assert.deepEqual((savedSnapshots[0] as any).assets, {});
  assert.equal(JSON.stringify(savedSnapshots).includes(assetData), false);
});

test('project repository reuploads an asset after a snapshot prunes it and undo references it again', async () => {
  const assetData = Buffer.from('undo-image').toString('base64');
  const uploads: unknown[] = [];
  const savedSnapshots: unknown[] = [];

  const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === '/api/projects' && !init) {
      return jsonResponse({
        projects: [{
          id: 'p-local',
          name: '本地项目',
          createdAt: '2026-04-25T10:00:00.000Z',
          updatedAt: '2026-04-25T10:00:00.000Z',
        }],
      });
    }

    if (url === '/api/projects/p-local/assets/asset-undo') {
      uploads.push(JSON.parse(String(init?.body)));
      return jsonResponse({ ok: true });
    }

    if (url === '/api/projects/p-local') {
      savedSnapshots.push(JSON.parse(String(init?.body)));
      return jsonResponse({ ok: true });
    }

    throw new Error(`unexpected request ${url}`);
  };

  const repository = createProjectRepository({ fetcher });
  const snapshotWithAsset = {
    nodes: [
      {
        id: 'image-1',
        type: 'imageNode',
        position: { x: 0, y: 0 },
        data: { imageAssetId: 'asset-undo' },
      },
    ],
    edges: [],
    assets: {
      'asset-undo': {
        id: 'asset-undo',
        mimeType: 'image/png',
        data: assetData,
      },
    },
  };

  await repository.saveProjectSnapshot('p-local', snapshotWithAsset);
  await repository.saveProjectSnapshot('p-local', {
    nodes: [],
    edges: [],
    assets: snapshotWithAsset.assets,
  });
  await repository.saveProjectSnapshot('p-local', snapshotWithAsset);

  assert.equal(uploads.length, 2);
  assert.deepEqual((savedSnapshots[1] as any).nodes, []);
});

test('project repository retries a lightweight save after reuploading missing referenced assets', async () => {
  const assetData = Buffer.from('missing-image').toString('base64');
  const uploads: unknown[] = [];
  let snapshotSaveAttempts = 0;

  const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === '/api/projects' && !init) {
      return jsonResponse({
        projects: [{
          id: 'p-local',
          name: '本地项目',
          createdAt: '2026-04-25T10:00:00.000Z',
          updatedAt: '2026-04-25T10:00:00.000Z',
        }],
      });
    }

    if (url === '/api/projects/p-local') {
      if (!init) {
        return jsonResponse({
          project: {
            id: 'p-local',
            name: '本地项目',
            createdAt: '2026-04-25T10:00:00.000Z',
            updatedAt: '2026-04-25T10:00:00.000Z',
          },
          snapshot: {
            nodes: [
              {
                id: 'image-1',
                type: 'imageNode',
                position: { x: 0, y: 0 },
                data: { imageAssetId: 'asset-missing' },
              },
            ],
            edges: [],
            assets: {
              'asset-missing': {
                id: 'asset-missing',
                mimeType: 'image/png',
                data: assetData,
              },
            },
          },
        });
      }

      snapshotSaveAttempts += 1;
      return snapshotSaveAttempts === 1
        ? jsonResponse({ error: 'Project asset missing: asset-missing' }, 400)
        : jsonResponse({ ok: true });
    }

    if (url === '/api/projects/p-local/assets/asset-missing') {
      uploads.push(JSON.parse(String(init?.body)));
      return jsonResponse({ ok: true });
    }

    throw new Error(`unexpected request ${url}`);
  };

  const repository = createProjectRepository({ fetcher });
  const loaded = await repository.loadProject('p-local');

  await repository.saveProjectSnapshot('p-local', loaded!.snapshot);

  assert.equal(snapshotSaveAttempts, 2);
  assert.deepEqual(uploads, [{
    asset: {
      id: 'asset-missing',
      mimeType: 'image/png',
      data: assetData,
    },
  }]);
});

test('project repository retries when the server reports a referenced asset content mismatch', async () => {
  const assetData = Buffer.from('expected-image').toString('base64');
  const uploads: unknown[] = [];
  const savedSnapshots: unknown[] = [];
  let snapshotSaveAttempts = 0;

  const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === '/api/projects' && !init) {
      return jsonResponse({
        projects: [{
          id: 'p-local',
          name: '本地项目',
          createdAt: '2026-04-25T10:00:00.000Z',
          updatedAt: '2026-04-25T10:00:00.000Z',
        }],
      });
    }

    if (url === '/api/projects/p-local') {
      if (!init) {
        return jsonResponse({
          project: {
            id: 'p-local',
            name: '本地项目',
            createdAt: '2026-04-25T10:00:00.000Z',
            updatedAt: '2026-04-25T10:00:00.000Z',
          },
          snapshot: {
            nodes: [
              {
                id: 'image-1',
                type: 'imageNode',
                position: { x: 0, y: 0 },
                data: { imageAssetId: 'asset-shared' },
              },
            ],
            edges: [],
            assets: {
              'asset-shared': {
                id: 'asset-shared',
                mimeType: 'image/png',
                data: assetData,
              },
            },
          },
        });
      }

      savedSnapshots.push(JSON.parse(String(init.body)));
      snapshotSaveAttempts += 1;
      return snapshotSaveAttempts === 1
        ? jsonResponse({ error: 'Project asset mismatch: asset-shared' }, 400)
        : jsonResponse({ ok: true });
    }

    if (url === '/api/projects/p-local/assets/asset-shared') {
      uploads.push(JSON.parse(String(init?.body)));
      return jsonResponse({ ok: true });
    }

    throw new Error(`unexpected request ${url}`);
  };

  const repository = createProjectRepository({ fetcher });
  const loaded = await repository.loadProject('p-local');

  await repository.saveProjectSnapshot('p-local', loaded!.snapshot);

  assert.equal(snapshotSaveAttempts, 2);
  assert.equal(uploads.length, 1);
  assert.equal(JSON.stringify(savedSnapshots).includes(assetData), false);
  assert.equal(typeof (savedSnapshots[0] as any).assetRefs['asset-shared'].sha256, 'string');
});
