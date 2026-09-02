import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BANANA_ASPECT_RATIO_VALUES,
  BANANA_STANDARD_ASPECT_RATIO_VALUES,
} from '../../lib/imageModels';
import {
  getEffectivePromptAspectRatio,
  getImage2MaskEditAspectRatio,
  getPromptAspectRatioOptions,
} from './promptAspectRatios';

test('getPromptAspectRatioOptions exposes every Banana ratio for Banana', () => {
  assert.deepEqual(getPromptAspectRatioOptions('banana'), [...BANANA_ASPECT_RATIO_VALUES]);
});

test('getPromptAspectRatioOptions exposes Lite ratios and excludes Pro-only unsupported extremes', () => {
  assert.deepEqual(
    getPromptAspectRatioOptions('banana-lite'),
    [...BANANA_ASPECT_RATIO_VALUES]
  );
  assert.deepEqual(
    getPromptAspectRatioOptions('banana-pro'),
    [...BANANA_STANDARD_ASPECT_RATIO_VALUES]
  );
});

test('getPromptAspectRatioOptions exposes only Image2-supported ratios for Image2', () => {
  assert.deepEqual(getPromptAspectRatioOptions('image2'), ['1:1', '4:3', '16:9', '3:4', '9:16']);
});

test('getEffectivePromptAspectRatio falls back unsupported Image2 ratios to square', () => {
  assert.equal(getEffectivePromptAspectRatio('image2', '21:9'), '1:1');
  assert.equal(getEffectivePromptAspectRatio('image2', '4:5'), '1:1');
});

test('getEffectivePromptAspectRatio preserves Banana-only ratios for Banana', () => {
  assert.equal(getEffectivePromptAspectRatio('banana', '21:9'), '21:9');
});

test('getEffectivePromptAspectRatio preserves Lite extremes and normalizes unsupported Pro ratios', () => {
  assert.equal(getEffectivePromptAspectRatio('banana-lite', '1:8'), '1:8');
  assert.equal(getEffectivePromptAspectRatio('banana-pro', '4:1'), '1:1');
  assert.equal(getEffectivePromptAspectRatio('banana-pro', '21:9'), '21:9');
});

test('getImage2MaskEditAspectRatio falls back Banana-only stored ratios to square', () => {
  assert.equal(getImage2MaskEditAspectRatio('21:9'), '1:1');
  assert.equal(getImage2MaskEditAspectRatio('16:9'), '16:9');
});
