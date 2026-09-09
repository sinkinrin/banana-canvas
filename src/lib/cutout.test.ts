import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { CUTOUT_INPUT_SIZE, getCutoutModel } from './cutoutModels';
import { cutoutAlpha, normalizeCutoutPixels } from './cutoutPixels';
import { createPersistedSnapshot, migrateCanvasNodesToAssetIds } from './canvasState';
import { canRerunImageNode } from '../components/nodes/useImageNodeActions';
import { CutoutModelStore } from '../../electron/cutoutModelStore';

test('IS-Net normalizes RGB in planar order and keeps alpha out of the input scale', () => {
  const pixels = new Uint8ClampedArray(CUTOUT_INPUT_SIZE ** 2 * 4);
  pixels[0] = 100; pixels[1] = 50; pixels[3] = 255;
  const values = normalizeCutoutPixels(pixels, 'isnet');
  assert.equal(values[0], 0.5);
  assert.equal(values[CUTOUT_INPUT_SIZE ** 2], 0);
  assert.equal(values[CUTOUT_INPUT_SIZE ** 2 * 2], -0.5);
});

test('constant foreground masks stay opaque; non-finite model results fail explicitly', () => {
  const values = new Float32Array(CUTOUT_INPUT_SIZE ** 2).fill(1);
  assert.equal(cutoutAlpha(values, 'isnet')[0], 255);
  values[0] = NaN;
  assert.throws(() => cutoutAlpha(values, 'isnet'), /INVALID_MASK/);
});

test('cutout output keeps PNG, source asset and model choice across save and reload, without generative rerun', () => {
  const snapshot = createPersistedSnapshot({
    nodes: [{ id: 'cutout', type: 'imageNode', position: { x: 0, y: 0 }, data: { generationMode: 'cutout', cutoutModelId: 'isnet-int8', imageAssetId: 'png', sourceImageAssetId: 'source' } }],
    edges: [], assets: { png: { id: 'png', data: 'alpha', mimeType: 'image/png' }, source: { id: 'source', data: 'original', mimeType: 'image/jpeg' } },
  });
  const reloaded = migrateCanvasNodesToAssetIds(snapshot.nodes, snapshot.assets);
  assert.equal(reloaded.nodes[0].data.cutoutModelId, 'isnet-int8');
  assert.equal(reloaded.assets.png.mimeType, 'image/png');
  assert.ok(reloaded.assets.source);
  assert.equal(canRerunImageNode({ ...reloaded.nodes[0].data, prompt: 'original prompt' }), false);
});

test('model catalog rejects arbitrary paths and downloads never install corrupt bytes', async () => {
  assert.throws(() => getCutoutModel('../outside'), /UNKNOWN_MODEL/);
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'banana-cutout-test-'));
  try {
    const store = new CutoutModelStore(directory, path.resolve('assets/models/isnet-int8.onnx'), async () => new Response(new Uint8Array([1, 2, 3])), () => {});
    await assert.rejects(store.download('isnet-fp32'), /MODEL_CORRUPT/);
    assert.deepEqual((await store.getState()).installed, ['isnet-int8']);
    assert.equal((await store.getState()).download, undefined);
    assert.equal((await fs.readdir(directory)).some((name) => name.endsWith('.part') || name.endsWith('.onnx')), false);
    await assert.rejects(store.remove('isnet-int8'), /BUNDLED_MODEL/);
    await assert.rejects(store.select('isnet-fp32'), /MODEL_MISSING/);
    await store.select('isnet-int8');
    const reloaded = new CutoutModelStore(directory, path.resolve('assets/models/isnet-int8.onnx'), fetch, () => {});
    assert.equal((await reloaded.getState()).selectedModelId, 'isnet-int8');
    await fs.writeFile(path.join(directory, 'preferences.json'), JSON.stringify({ selectedModelId: 'isnet-fp32' }));
    const missingSelected = new CutoutModelStore(directory, path.resolve('assets/models/isnet-int8.onnx'), fetch, () => {});
    assert.equal((await missingSelected.getState()).selectedModelId, 'isnet-int8');
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});
