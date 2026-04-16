import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LEGACY_ASSET_STORAGE_KEY,
  LEGACY_CANVAS_STORAGE_KEY,
  PROJECT_INDEX_KEY,
  createMemoryProjectStorage,
  loadProjectIndex,
  loadProjectSnapshot,
  migrateLegacyCanvasIfNeeded,
  saveProjectSnapshot,
  type StorageAdapter,
} from './projectStorage';

test('saveProjectSnapshot writes a project snapshot and updates the index timestamp', async () => {
  const storage = createMemoryProjectStorage();

  await storage.seedIndex([
    {
      id: 'p1',
      name: '项目 1',
      createdAt: '2026-04-16T10:00:00.000Z',
      updatedAt: '2026-04-16T10:00:00.000Z',
    },
  ]);

  await saveProjectSnapshot(storage.adapter, 'p1', {
    nodes: [],
    edges: [],
    assets: {},
  });

  const snapshot = await loadProjectSnapshot(storage.adapter, 'p1');
  const index = await loadProjectIndex(storage.adapter);

  assert.deepEqual(snapshot, { nodes: [], edges: [], assets: {} });
  assert.equal(index.length, 1);
  assert.notEqual(index[0].updatedAt, '2026-04-16T10:00:00.000Z');
});

test('migrateLegacyCanvasIfNeeded creates a default project from the old single-canvas keys', async () => {
  const storage = createMemoryProjectStorage();

  await storage.seedLegacyCanvas({
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

  const projectId = await migrateLegacyCanvasIfNeeded(storage.adapter);
  const index = await loadProjectIndex(storage.adapter);
  const snapshot = await loadProjectSnapshot(storage.adapter, projectId!);

  assert.equal(index.length, 1);
  assert.equal(index[0].name, '未命名项目');
  assert.equal(snapshot?.nodes.length, 1);
});

test('migrateLegacyCanvasIfNeeded drops malformed legacy node and edge entries', async () => {
  const storage = createMemoryProjectStorage();

  await storage.adapter.set(
    LEGACY_CANVAS_STORAGE_KEY,
    JSON.stringify({
      state: {
        nodes: [
          42,
          {
            id: 'n1',
            type: 'promptNode',
            position: { x: 0, y: 0 },
            data: { prompt: 'banana' },
          },
        ],
        edges: [
          null,
          {
            id: 'e1',
            source: 'n1',
            target: 'n2',
          },
        ],
      },
      version: 0,
    })
  );
  await storage.adapter.set(LEGACY_ASSET_STORAGE_KEY, {});

  const projectId = await migrateLegacyCanvasIfNeeded(storage.adapter);
  const snapshot = await loadProjectSnapshot(storage.adapter, projectId!);

  assert.equal(snapshot?.nodes.length, 1);
  assert.equal(snapshot?.nodes[0].id, 'n1');
  assert.equal(snapshot?.nodes[0].data.prompt, 'banana');
  assert.equal(snapshot?.edges.length, 1);
  assert.equal(snapshot?.edges[0].id, 'e1');
  assert.deepEqual(snapshot?.assets, {});
});

test('loadProjectIndex ignores malformed stored project metadata', async () => {
  const storage = createMemoryProjectStorage();

  await storage.adapter.set(PROJECT_INDEX_KEY, [{ id: 'p1', updatedAt: 'missing-fields' }]);

  const index = await loadProjectIndex(storage.adapter);

  assert.deepEqual(index, []);
});

test('loadProjectSnapshot sanitizes malformed stored snapshot shapes', async () => {
  const storage = createMemoryProjectStorage();

  await storage.adapter.set('banana-project:p1', {
    nodes: 'bad',
    edges: {},
    assets: [],
  });

  const snapshot = await loadProjectSnapshot(storage.adapter, 'p1');

  assert.deepEqual(snapshot, {
    nodes: [],
    edges: [],
    assets: {},
  });
});

test('loadProjectSnapshot drops malformed node and edge entries inside arrays', async () => {
  const storage = createMemoryProjectStorage();

  await storage.adapter.set('banana-project:p1', {
    nodes: [
      42,
      {
        id: 'n1',
        type: 'promptNode',
        position: { x: 1, y: 2 },
        data: { prompt: 'banana' },
      },
    ],
    edges: [
      null,
      {
        id: 'e1',
        source: 'n1',
        target: 'n2',
      },
    ],
    assets: {},
  });

  const snapshot = await loadProjectSnapshot(storage.adapter, 'p1');

  assert.deepEqual(snapshot, {
    nodes: [
      {
        id: 'n1',
        type: 'promptNode',
        position: { x: 1, y: 2 },
        data: { prompt: 'banana' },
      },
    ],
    edges: [
      {
        id: 'e1',
        source: 'n1',
        target: 'n2',
      },
    ],
    assets: {},
  });
});

test('migrateLegacyCanvasIfNeeded does not persist the project index when migration fails midway', async () => {
  const memory = new Map<string, unknown>();
  let failWrites = false;
  let setCount = 0;

  const adapter: StorageAdapter = {
    async get(key) {
      return memory.has(key) ? structuredClone(memory.get(key)!) : null;
    },
    async set(key, value) {
      if (failWrites) {
        setCount += 1;
      }
      if (failWrites && setCount === 2) {
        throw new Error('simulated write failure');
      }
      memory.set(key, structuredClone(value));
    },
    async del(key) {
      memory.delete(key);
    },
  };

  await adapter.set(
    LEGACY_CANVAS_STORAGE_KEY,
    JSON.stringify({
      state: {
        nodes: [],
        edges: [],
      },
      version: 0,
    })
  );
  await adapter.set(LEGACY_ASSET_STORAGE_KEY, {});
  failWrites = true;

  await assert.rejects(() => migrateLegacyCanvasIfNeeded(adapter), /simulated write failure/);
  assert.deepEqual(await loadProjectIndex(adapter), []);
});
