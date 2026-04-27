import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildDownloadFileName,
  buildReferenceNodeData,
  canRerunImageNode,
  getRerunReferenceImages,
} from './useImageNodeActions';
import type { CanvasImageAsset } from '../../lib/canvasState';

test('canRerunImageNode disables rerun for mask edit results', () => {
  assert.equal(canRerunImageNode({ prompt: 'draw', generationMode: 'mask-edit' }), false);
  assert.equal(canRerunImageNode({ prompt: 'draw' }), true);
  assert.equal(canRerunImageNode({ prompt: '' }), false);
});

test('getRerunReferenceImages resolves saved reference assets', () => {
  const assets: Record<string, CanvasImageAsset> = {
    'ref-1': { id: 'ref-1', data: 'base64-ref', mimeType: 'image/png' },
  };

  assert.deepEqual(
    getRerunReferenceImages({ referenceImageIds: ['ref-1'] }, assets),
    [{ data: 'base64-ref', mimeType: 'image/png' }]
  );
});

test('buildReferenceNodeData carries current model options into a new prompt node', () => {
  assert.deepEqual(
    buildReferenceNodeData({
      imageModel: 'image2',
      bananaOptions: { thinkingLevel: 'HIGH' },
      image2Options: { quality: 'high' },
      referencePayload: { referenceImageIds: ['asset-1'] },
    }),
    {
      prompt: '',
      imageModel: 'image2',
      bananaOptions: undefined,
      image2Options: { quality: 'high' },
      referenceImageIds: ['asset-1'],
    }
  );
});

test('buildDownloadFileName uses banana-art prefix and png suffix', () => {
  assert.equal(buildDownloadFileName(1234), 'banana-art-1234.png');
});
