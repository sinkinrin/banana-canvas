import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getAspectRatioValue,
  getFixedArtboardCamera,
  getSketchArtboard,
  getSketchOutputSize,
} from './sketchGeometry';

test('sketch artboards preserve the selected generation ratio', () => {
  assert.equal(getAspectRatioValue('16:9'), 16 / 9);
  assert.deepEqual(getSketchArtboard('1:1'), { width: 1024, height: 1024 });
  assert.deepEqual(getSketchArtboard('8:1'), { width: 1024, height: 128 });
  assert.deepEqual(getSketchArtboard('1:8'), { width: 128, height: 1024 });
});

test('sketch output is capped by a fixed long edge without changing its ratio', () => {
  assert.deepEqual(getSketchOutputSize('16:9'), { width: 2048, height: 1152 });
  assert.deepEqual(getSketchOutputSize('9:16'), { width: 1152, height: 2048 });
  assert.deepEqual(getSketchOutputSize('1:8'), { width: 256, height: 2048 });
});

test('fixed artboard camera maps the logical artboard into the visible frame', () => {
  assert.deepEqual(
    getFixedArtboardCamera({ width: 800, height: 450 }, getSketchArtboard('16:9')),
    { x: 0, y: 0, z: 0.78125 }
  );

  const squareCamera = getFixedArtboardCamera(
    { width: 800, height: 600 },
    getSketchArtboard('1:1')
  );
  assert.equal(squareCamera.z, 0.5859375);
  assert.ok(Math.abs(squareCamera.x - 512 / 3) < 0.000001);
  assert.equal(squareCamera.y, 0);
});
