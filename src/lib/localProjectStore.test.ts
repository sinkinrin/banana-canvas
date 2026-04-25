import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { createLocalProjectStore } from './localProjectStore';

async function createTempStore() {
  const rootDir = await mkdtemp(join(tmpdir(), 'banana-local-store-'));
  return {
    rootDir,
    store: createLocalProjectStore(rootDir),
  };
}

test('local project store writes and loads a project snapshot', async () => {
  const { store } = await createTempStore();

  const project = await store.createProject('  本地项目  ', {
    nodes: [
      {
        id: 'n1',
        type: 'promptNode',
        position: { x: 1, y: 2 },
        data: { prompt: 'banana' },
      },
    ],
    edges: [],
    assets: {},
  });

  const loaded = await store.loadProject(project.id);
  const index = await store.loadProjectIndex();

  assert.equal(project.name, '本地项目');
  assert.equal(index.length, 1);
  assert.equal(loaded?.project.id, project.id);
  assert.equal(loaded?.snapshot.nodes[0].data.prompt, 'banana');
});

test('local project store writes assets as files and restores base64 assets', async () => {
  const { rootDir, store } = await createTempStore();

  const project = await store.createProject('带图项目', {
    nodes: [
      {
        id: 'img-node',
        type: 'imageNode',
        position: { x: 0, y: 0 },
        data: { imageAssetId: 'asset-png' },
      },
    ],
    edges: [],
    assets: {
      'asset-png': {
        id: 'asset-png',
        mimeType: 'image/png',
        data: Buffer.from('fake-png').toString('base64'),
      },
    },
  });

  const assetPath = join(rootDir, 'projects', project.id, 'assets', 'asset-png.png');
  const file = await readFile(assetPath);
  const loaded = await store.loadProject(project.id);

  assert.equal(file.toString(), 'fake-png');
  assert.deepEqual(loaded?.snapshot.assets['asset-png'], {
    id: 'asset-png',
    mimeType: 'image/png',
    data: Buffer.from('fake-png').toString('base64'),
  });
});

test('local project store deletes a project directory and index entry', async () => {
  const { rootDir, store } = await createTempStore();
  const project = await store.createProject('删除项目');

  await store.deleteProject(project.id);

  const index = await store.loadProjectIndex();
  await assert.rejects(() => stat(join(rootDir, 'projects', project.id)));
  assert.deepEqual(index, []);
});

test('local project store imports a project with an existing id', async () => {
  const { store } = await createTempStore();

  await store.importProject(
    {
      id: 'existing-project',
      name: '旧项目',
      createdAt: '2026-04-24T10:00:00.000Z',
      updatedAt: '2026-04-24T10:00:00.000Z',
    },
    {
      nodes: [],
      edges: [],
      assets: {},
    }
  );

  const index = await store.loadProjectIndex();
  const loaded = await store.loadProject('existing-project');

  assert.equal(index[0].id, 'existing-project');
  assert.equal(loaded?.project.name, '旧项目');
});

test('local project store imports multiple projects in a single index update', async () => {
  const { store } = await createTempStore();

  await store.importProjects([
    {
      project: {
        id: 'bulk-one',
        name: '批量项目 1',
        createdAt: '2026-04-25T10:00:00.000Z',
        updatedAt: '2026-04-25T10:00:00.000Z',
      },
      snapshot: {
        nodes: [],
        edges: [],
        assets: {},
      },
    },
    {
      project: {
        id: 'bulk-two',
        name: '批量项目 2',
        createdAt: '2026-04-25T11:00:00.000Z',
        updatedAt: '2026-04-25T11:00:00.000Z',
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
  ]);

  const index = await store.loadProjectIndex();
  const loaded = await store.loadProject('bulk-two');

  assert.deepEqual(index.map((project) => project.id), ['bulk-one', 'bulk-two']);
  assert.equal(loaded?.snapshot.nodes[0].data.prompt, 'banana');
});

test('local project store rejects saving snapshots for projects missing from the index', async () => {
  const { store } = await createTempStore();

  await assert.rejects(
    () => store.saveProjectSnapshot('missing-project', { nodes: [], edges: [], assets: {} }),
    /Project not found/
  );
});

test('local project store serializes concurrent saves so the last snapshot wins', async () => {
  const { store } = await createTempStore();
  const project = await store.createProject('并发保存');
  const largeAssetData = Buffer.alloc(8 * 1024 * 1024, 7).toString('base64');
  const finalAssetData = Buffer.from('final-asset').toString('base64');

  await Promise.all([
    store.saveProjectSnapshot(project.id, {
      nodes: [
        {
          id: 'slow-node',
          type: 'imageNode',
          position: { x: 0, y: 0 },
          data: { imageAssetId: 'slow-asset' },
        },
      ],
      edges: [],
      assets: {
        'slow-asset': {
          id: 'slow-asset',
          mimeType: 'image/png',
          data: largeAssetData,
        },
      },
    }),
    store.saveProjectSnapshot(project.id, {
      nodes: [
        {
          id: 'final-node',
          type: 'imageNode',
          position: { x: 0, y: 0 },
          data: { imageAssetId: 'final-asset' },
        },
      ],
      edges: [],
      assets: {
        'final-asset': {
          id: 'final-asset',
          mimeType: 'image/png',
          data: finalAssetData,
        },
      },
    }),
  ]);

  const loaded = await store.loadProject(project.id);

  assert.equal(loaded?.snapshot.nodes[0].id, 'final-node');
  assert.deepEqual(Object.keys(loaded?.snapshot.assets ?? {}), ['final-asset']);
  assert.equal(loaded?.snapshot.assets['final-asset'].data, finalAssetData);
});

test('local project store rejects path traversal project ids', async () => {
  const { store } = await createTempStore();

  await assert.rejects(
    () => store.loadProject('../outside'),
    /Invalid project id/
  );
  await assert.rejects(
    () => store.saveProjectSnapshot('..\\outside', { nodes: [], edges: [], assets: {} }),
    /Invalid project id/
  );
});
