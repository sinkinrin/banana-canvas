import test from 'node:test';
import assert from 'node:assert/strict';

import {
  validateGenerateImageRequest,
  type GenerateImageRequestBody,
} from './requestValidation';

const png = Buffer.from('valid png bytes').toString('base64');
const jpg = Buffer.from('valid jpg bytes').toString('base64');

test('rejects non-string prompt values', () => {
  const result = validateGenerateImageRequest({ prompt: 42 });

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error, 'prompt must be a string');
});

test('preserves referenceImages precedence over referenceImage', () => {
  const body: GenerateImageRequestBody = {
    prompt: 'draw',
    referenceImages: [{ data: png, mimeType: 'image/png' }],
    referenceImage: { data: jpg, mimeType: 'image/jpeg' },
  };

  const result = validateGenerateImageRequest(body);

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.value.referenceImages, [{ data: png, mimeType: 'image/png' }]);
  }
});

test('rejects more than four effective reference images', () => {
  const result = validateGenerateImageRequest({
    referenceImages: Array.from({ length: 5 }, () => ({ data: png, mimeType: 'image/png' })),
  });

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error, 'referenceImages must contain at most 4 images');
});

test('rejects malformed reference image entries', () => {
  const result = validateGenerateImageRequest({
    referenceImages: [{ data: '', mimeType: 'text/plain' }],
  });

  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /referenceImages\[0\]/);
});

test('rejects maskImage for Banana requests', () => {
  const result = validateGenerateImageRequest({
    imageModel: 'banana',
    maskImage: { data: png, mimeType: 'image/png' },
  });

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error, 'maskImage is only supported for Image2 requests');
});

test('rejects non-PNG mask payloads for Image2 requests', () => {
  const result = validateGenerateImageRequest({
    imageModel: 'image2',
    maskImage: { data: jpg, mimeType: 'image/jpeg' },
  });

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error, 'maskImage must be an image/png payload');
});

test('returns normalized provider options and effective generation fields', () => {
  const result = validateGenerateImageRequest({
    prompt: 'draw',
    imageModel: 'image2',
    aspectRatio: '16:9',
    imageSize: '1K',
    referenceImage: { data: png, mimeType: 'image/png' },
    image2Options: { quality: 'high', outputFormat: 'webp', outputCompression: 80 },
    customKey: 'test-key',
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.prompt, 'draw');
    assert.equal(result.value.imageModel, 'image2');
    assert.equal(result.value.provider, 'openai-chat');
    assert.equal(result.value.aspectRatio, '16:9');
    assert.equal(result.value.imageSize, '1K');
    assert.equal(result.value.customKey, 'test-key');
    assert.deepEqual(result.value.referenceImages, [{ data: png, mimeType: 'image/png' }]);
    assert.deepEqual(result.value.image2Options, {
      quality: 'high',
      outputFormat: 'webp',
      outputCompression: 80,
    });
  }
});

test('normalizes generation dimensions and omits invalid values', () => {
  const legacySizeResult = validateGenerateImageRequest({
    aspectRatio: '16:9',
    imageSize: '512px',
  });

  assert.equal(legacySizeResult.ok, true);
  if (legacySizeResult.ok) {
    assert.equal(legacySizeResult.value.aspectRatio, '16:9');
    assert.equal(legacySizeResult.value.imageSize, '512');
  }

  const invalidDimensionsResult = validateGenerateImageRequest({
    aspectRatio: 'wide',
    imageSize: 'huge',
  });

  assert.equal(invalidDimensionsResult.ok, true);
  if (invalidDimensionsResult.ok) {
    assert.equal(invalidDimensionsResult.value.aspectRatio, undefined);
    assert.equal(invalidDimensionsResult.value.imageSize, undefined);
  }
});
