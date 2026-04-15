import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createReferenceImagePayload,
  areHistoryStatesEqual,
  collectReferencedAssetIdsFromHistory,
  createHistorySnapshot,
  createPersistedSnapshot,
  migrateCanvasNodesToAssetIds,
  normalizeNodeDataWithAssets,
  pruneAssets,
  type PersistedCanvasState,
} from './canvasState';

test('history snapshot excludes inline image payloads but keeps asset ids', () => {
  const state: PersistedCanvasState = {
    nodes: [
      {
        id: 'prompt-1',
        type: 'promptNode',
        position: { x: 10, y: 20 },
        data: {
          prompt: 'banana',
          referenceImageIds: ['asset-1'],
          referenceImages: [
            { data: 'base64-ref', mimeType: 'image/png', url: 'data:image/png;base64,base64-ref' },
          ],
          isLoading: true,
          error: 'boom',
        },
      },
      {
        id: 'image-1',
        type: 'imageNode',
        position: { x: 30, y: 40 },
        data: {
          imageAssetId: 'asset-2',
          imageUrl: 'data:image/png;base64,base64-image',
        },
      },
    ],
    edges: [],
    assets: {
      'asset-1': { id: 'asset-1', data: 'base64-ref', mimeType: 'image/png' },
      'asset-2': { id: 'asset-2', data: 'base64-image', mimeType: 'image/png' },
    },
  };

  const history = createHistorySnapshot(state);

  assert.equal('assets' in history, false);
  assert.deepEqual(history.nodes[0].data.referenceImageIds, ['asset-1']);
  assert.equal(history.nodes[0].data.referenceImages, undefined);
  assert.equal(history.nodes[1].data.imageAssetId, 'asset-2');
  assert.equal(history.nodes[1].data.imageUrl, undefined);
  assert.equal(history.nodes[0].data.isLoading, false);
  assert.equal(history.nodes[0].data.error, undefined);
});

test('persisted snapshot keeps assets separately and strips inline payloads from nodes', () => {
  const state: PersistedCanvasState = {
    nodes: [
      {
        id: 'image-1',
        type: 'imageNode',
        position: { x: 30, y: 40 },
        data: {
          imageAssetId: 'asset-2',
          imageUrl: 'data:image/png;base64,base64-image',
          isLoading: true,
          error: 'boom',
        },
      },
    ],
    edges: [],
    assets: {
      'asset-2': { id: 'asset-2', data: 'base64-image', mimeType: 'image/png' },
    },
  };

  const persisted = createPersistedSnapshot(state);

  assert.equal(persisted.nodes[0].data.imageUrl, undefined);
  assert.equal(persisted.nodes[0].data.isLoading, false);
  assert.equal(persisted.nodes[0].data.error, undefined);
  assert.deepEqual(persisted.assets, state.assets);
});

test('migration extracts legacy inline payloads into asset ids', () => {
  const migrated = migrateCanvasNodesToAssetIds(
    [
      {
        id: 'prompt-1',
        type: 'promptNode',
        position: { x: 0, y: 0 },
        data: {
          prompt: 'banana',
          referenceImages: [
            { data: 'base64-ref', mimeType: 'image/png', url: 'data:image/png;base64,base64-ref' },
          ],
        },
      },
      {
        id: 'image-1',
        type: 'imageNode',
        position: { x: 10, y: 10 },
        data: {
          imageUrl: 'data:image/png;base64,base64-image',
        },
      },
    ],
    {}
  );

  assert.equal(migrated.nodes[0].data.referenceImages, undefined);
  assert.equal(migrated.nodes[0].data.referenceImageIds?.length, 1);
  assert.equal(migrated.nodes[1].data.imageUrl, undefined);
  assert.ok(migrated.nodes[1].data.imageAssetId);
  assert.equal(Object.keys(migrated.assets).length, 2);
});

test('normalization appends new reference images to existing asset ids instead of replacing them', () => {
  const normalized = normalizeNodeDataWithAssets(
    {
      referenceImageIds: ['asset-existing'],
      referenceImages: [
        { data: 'base64-new', mimeType: 'image/png', url: 'data:image/png;base64,base64-new' },
      ],
    },
    {
      'asset-existing': {
        id: 'asset-existing',
        data: 'base64-old',
        mimeType: 'image/png',
      },
    }
  );

  assert.equal(normalized.data.referenceImageIds?.length, 2);
  assert.equal(normalized.data.referenceImageIds?.[0], 'asset-existing');
  assert.equal(Object.keys(normalized.assets).length, 2);
});

test('normalization enforces the 4 reference image limit', () => {
  const normalized = normalizeNodeDataWithAssets(
    {
      referenceImageIds: ['a1', 'a2', 'a3', 'a4'],
      referenceImages: [
        { data: 'base64-new', mimeType: 'image/png', url: 'data:image/png;base64,base64-new' },
      ],
    },
    {
      a1: { id: 'a1', data: '1', mimeType: 'image/png' },
      a2: { id: 'a2', data: '2', mimeType: 'image/png' },
      a3: { id: 'a3', data: '3', mimeType: 'image/png' },
      a4: { id: 'a4', data: '4', mimeType: 'image/png' },
    }
  );

  assert.deepEqual(normalized.data.referenceImageIds, ['a1', 'a2', 'a3', 'a4']);
  assert.equal(Object.keys(normalized.assets).length, 4);
});

test('asset pruning keeps ids referenced by current and history states', () => {
  const currentIds = new Set(['asset-current']);
  const historyIds = collectReferencedAssetIdsFromHistory([
    {
      nodes: [
        {
          id: 'image-1',
          type: 'imageNode',
          position: { x: 0, y: 0 },
          data: { imageAssetId: 'asset-history' },
        },
      ],
    },
  ]);
  historyIds.forEach((id) => currentIds.add(id));

  const pruned = pruneAssets(
    {
      'asset-current': { id: 'asset-current', data: 'a', mimeType: 'image/png' },
      'asset-history': { id: 'asset-history', data: 'b', mimeType: 'image/png' },
      'asset-orphan': { id: 'asset-orphan', data: 'c', mimeType: 'image/png' },
    },
    currentIds
  );

  assert.deepEqual(Object.keys(pruned).sort(), ['asset-current', 'asset-history']);
});

test('history equality compares snapshots structurally without serialization', () => {
  assert.equal(
    areHistoryStatesEqual(
      {
        nodes: [{ id: 'n1', type: 'promptNode', position: { x: 1, y: 2 }, data: { prompt: 'banana' } }],
        edges: [],
      },
      {
        nodes: [{ id: 'n1', type: 'promptNode', position: { x: 1, y: 2 }, data: { prompt: 'banana' } }],
        edges: [],
      }
    ),
    true
  );

  assert.equal(
    areHistoryStatesEqual(
      {
        nodes: [{ id: 'n1', type: 'promptNode', position: { x: 1, y: 2 }, data: { prompt: 'banana' } }],
        edges: [],
      },
      {
        nodes: [{ id: 'n1', type: 'promptNode', position: { x: 3, y: 2 }, data: { prompt: 'banana' } }],
        edges: [],
      }
    ),
    false
  );
});

test('history snapshot strips transient xyflow fields', () => {
  const history = createHistorySnapshot({
    nodes: [
      {
        id: 'n1',
        type: 'promptNode',
        position: { x: 1, y: 2 },
        selected: true,
        dragging: true,
        width: 320,
        data: { prompt: 'banana', isLoading: true, error: 'boom' },
      },
    ],
    edges: [
      {
        id: 'e1',
        source: 'n1',
        target: 'n2',
        selected: true,
        animated: true,
      },
    ],
    assets: {},
  });

  assert.equal('selected' in history.nodes[0], false);
  assert.equal('dragging' in history.nodes[0], false);
  assert.equal('width' in history.nodes[0], false);
  assert.equal(history.nodes[0].data.isLoading, false);
  assert.equal('selected' in history.edges[0], false);
  assert.equal('animated' in history.edges[0], false);
});

test('normalization keeps non-data image urls inline', () => {
  const normalized = normalizeNodeDataWithAssets(
    {
      imageUrl: 'https://example.com/image.png',
    },
    {}
  );

  assert.equal(normalized.data.imageUrl, 'https://example.com/image.png');
  assert.equal(normalized.data.imageAssetId, undefined);
  assert.deepEqual(normalized.assets, {});
});

test('reference payload uses asset ids when available', () => {
  assert.deepEqual(
    createReferenceImagePayload('https://example.com/image.png', 'asset-1'),
    {
      referenceImageIds: ['asset-1'],
      referenceImages: undefined,
    }
  );
});

test('reference payload rejects non-data urls without asset ids', () => {
  assert.equal(createReferenceImagePayload('https://example.com/image.png'), null);
});
