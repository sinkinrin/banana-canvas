import test from 'node:test';
import assert from 'node:assert/strict';

import { createEmptyProjectSnapshot, normalizeProjectSnapshot } from './projectSession';

test('createEmptyProjectSnapshot returns an empty canvas payload', () => {
  assert.deepEqual(createEmptyProjectSnapshot(), {
    nodes: [],
    edges: [],
    assets: {},
  });
});

test('normalizeProjectSnapshot preserves nodes, edges and assets', () => {
  const snapshot = normalizeProjectSnapshot({
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

  assert.equal(snapshot.nodes.length, 1);
  assert.equal(snapshot.edges.length, 0);
  assert.deepEqual(snapshot.assets, {});
});
