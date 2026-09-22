import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, stat, utimes, unlink, writeFile } from 'node:fs/promises';
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

test('local project storage preserves AVIF and HEIC originals for send-time conversion', async () => {
  const {store} = await createTempStore();
  for (const mimeType of ['image/avif','image/heic','image/heif']) {
    const asset = {id:'original',mimeType,data:Buffer.from('original-container').toString('base64')};
    const project = await store.createProject('Compatible reference', {
      nodes:[{id:'n',type:'promptNode',position:{x:0,y:0},data:{referenceImageIds:['original']}}], edges:[],assets:{original:asset},
    });
    assert.deepEqual((await store.loadProject(project.id))?.snapshot.assets.original, asset);
  }
});

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

test('local project store does not rewrite unchanged asset files on repeated snapshot saves', async () => {
  const { rootDir, store } = await createTempStore();
  const assetData = Buffer.from('same-asset').toString('base64');
  const snapshot = {
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
        data: assetData,
      },
    },
  };

  const project = await store.createProject('重复保存', snapshot);
  const assetPath = join(rootDir, 'projects', project.id, 'assets', 'asset-png.png');
  const oldTime = new Date('2026-01-01T00:00:00.000Z');
  await utimes(assetPath, oldTime, oldTime);

  await store.saveProjectSnapshot(project.id, snapshot);

  assert.equal((await stat(assetPath)).mtime.getTime(), oldTime.getTime());
});

test('local project store rewrites same-id assets when content changes', async () => {
  const { rootDir, store } = await createTempStore();
  const project = await store.createProject('同 ID 资源更新', {
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
        data: Buffer.from('old').toString('base64'),
      },
    },
  });

  await store.saveProjectSnapshot(project.id, {
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
        data: Buffer.from('new').toString('base64'),
      },
    },
  });

  const assetPath = join(rootDir, 'projects', project.id, 'assets', 'asset-png.png');
  const loaded = await store.loadProject(project.id);

  assert.equal((await readFile(assetPath)).toString(), 'new');
  assert.equal(loaded?.snapshot.assets['asset-png'].data, Buffer.from('new').toString('base64'));
});

test('local project store writes newly referenced assets and prunes removed assets', async () => {
  const { rootDir, store } = await createTempStore();
  const project = await store.createProject('新增资源', {
    nodes: [
      {
        id: 'img-node',
        type: 'imageNode',
        position: { x: 0, y: 0 },
        data: { imageAssetId: 'old-asset' },
      },
    ],
    edges: [],
    assets: {
      'old-asset': {
        id: 'old-asset',
        mimeType: 'image/png',
        data: Buffer.from('old').toString('base64'),
      },
    },
  });

  await store.saveProjectSnapshot(project.id, {
    nodes: [
      {
        id: 'img-node',
        type: 'imageNode',
        position: { x: 0, y: 0 },
        data: { imageAssetId: 'new-asset' },
      },
    ],
    edges: [],
    assets: {
      'new-asset': {
        id: 'new-asset',
        mimeType: 'image/png',
        data: Buffer.from('new').toString('base64'),
      },
    },
  });

  const assetDir = join(rootDir, 'projects', project.id, 'assets');
  await assert.rejects(() => stat(join(assetDir, 'old-asset.png')));
  assert.equal((await readFile(join(assetDir, 'new-asset.png'))).toString(), 'new');
});

test('local project store moves deleted projects to recoverable trash and removes the index entry', async () => {
  const { rootDir, store } = await createTempStore();
  const project = await store.createProject('删除项目');

  await store.deleteProject(project.id);

  const index = await store.loadProjectIndex();
  await assert.rejects(() => stat(join(rootDir, 'projects', project.id)));
  assert.ok((await readdir(join(rootDir, '.trash'))).some((name) => name.startsWith(`${project.id}-`)));
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

test('local project store rejects malformed project imports before writing', async () => {
  const { store } = await createTempStore();

  await assert.rejects(
    () => store.importProjects([{} as never]),
    /Invalid project import metadata/
  );
  assert.deepEqual(await store.loadProjectIndex(), []);
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


test('missing or malformed metadata blocks loading and saving without deleting recoverable images', async () => {
  const { rootDir, store } = await createTempStore();
  const asset = { id: 'a', mimeType: 'image/png', data: 'aGVsbG8=' };
  const project = await store.createProject('recoverable', {
    nodes: [{ id: 'n', type: 'imageNode', position: { x: 0, y: 0 }, data: { imageAssetId: 'a' } }], edges: [], assets: { a: asset },
  });
  const metadata = join(rootDir, 'projects', project.id, 'project.json');
  const image = join(rootDir, 'projects', project.id, 'assets', 'a.png');
  for (const corrupt of [null, '{}', '{broken']) {
    if (corrupt === null) await unlink(metadata);
    else await writeFile(metadata, corrupt);
    await assert.rejects(store.loadProject(project.id));
    await assert.rejects(store.loadProjectAsset(project.id, 'a'));
    await assert.rejects(store.saveProjectSnapshot(project.id, { nodes: [], edges: [], assets: {} }));
    await assert.rejects(store.saveProjectAsset(project.id, asset));
    assert.equal((await readFile(image)).toString(), 'hello');
    if (corrupt !== null) assert.equal(await readFile(metadata, 'utf8'), corrupt);
  }
});
