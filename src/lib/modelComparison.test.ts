import assert from 'node:assert/strict';
import test from 'node:test';
import { getComparisonOptions, markComparisonWinner, normalizeComparisonModels } from './modelComparison';
import { createPersistedSnapshot, createHistorySnapshot, type CanvasNode } from './canvasState';
import { normalizeGenerationInfo } from './generationInfo';

test('comparison selections share supported sizes and ignore unknown or duplicate models', () => {
  assert.deepEqual(normalizeComparisonModels(['image2.5-flare', 'banana-lite', 'banana-lite', 'unknown']), ['image2.5-flare', 'banana-lite']);
  assert.deepEqual(getComparisonOptions(['banana-lite', 'image2.5-sunburst']).sizes, ['1K']);
  assert.ok(getComparisonOptions(['banana-pro', 'image2.5-flare']).ratios.includes('16:9'));
});

test('comparison winner and measured metadata survive persistence and undo snapshots', () => {
  const nodes: CanvasNode[] = ['a', 'b', 'other'].map(id => ({ id, type: 'imageNode', position: { x: 0, y: 0 }, data: {
    comparisonGroupId: id === 'other' ? 'other' : 'pair', comparisonWinner: id === 'a' || id === 'other',
    imageUrl: 'https://example.com/result.png', imageModel: 'image2.5-flare',
    generationInfo: { apiModel: 'gpt-image-2.5-flare', elapsedMs: 1234, requestedQuality: 'high', reportedQuality: 'medium' },
  } }));
  const selected = markComparisonWinner(nodes, 'b');
  assert.equal(selected[0].data.comparisonWinner, undefined);
  assert.equal(selected[1].data.comparisonWinner, true);
  assert.equal(selected[2].data.comparisonWinner, true);
  for (const snapshot of [createPersistedSnapshot({ nodes: selected, edges: [], assets: {} }), createHistorySnapshot({ nodes: selected, edges: [], assets: {} })]) {
    assert.equal(snapshot.nodes[1].data.comparisonGroupId, 'pair');
    assert.equal(snapshot.nodes[1].data.comparisonWinner, true);
    assert.deepEqual(snapshot.nodes[1].data.generationInfo, selected[1].data.generationInfo);
  }
  assert.equal(markComparisonWinner(selected, 'b')[1].data.comparisonWinner, undefined);
  assert.deepEqual(normalizeGenerationInfo({ elapsedMs: -1, outputTokens: Infinity, reportedQuality: {}, secret: 'hidden' }), undefined);
});
