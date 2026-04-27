import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildImageMaskGenerationPayload,
  buildPromptMaskGenerationPayload,
} from './useMaskGeneration';

const sourceImage = { data: 'source', mimeType: 'image/png', url: 'data:image/png;base64,source' };
const extraImage = { data: 'extra', mimeType: 'image/png', url: 'data:image/png;base64,extra' };
const maskImage = { data: 'mask', mimeType: 'image/png' } as const;

test('prompt mask generation places source image first and excludes edited reference duplicate', () => {
  assert.deepEqual(
    buildPromptMaskGenerationPayload({
      maskPrompt: '改帽子',
      maskImage,
      sourceImage,
      sourceIndex: 0,
      referenceImages: [sourceImage, extraImage],
      aspectRatio: '1:1',
      imageSize: '1K',
      image2Options: { quality: 'high' },
    }),
    {
      prompt: '改帽子',
      imageModel: 'image2',
      aspectRatio: '1:1',
      imageSize: '1K',
      image2Options: { quality: 'high' },
      referenceImages: [
        { data: 'source', mimeType: 'image/png' },
        { data: 'extra', mimeType: 'image/png' },
      ],
      maskImage,
    }
  );
});

test('image mask generation uses only the edited image as reference', () => {
  assert.deepEqual(
    buildImageMaskGenerationPayload({
      maskPrompt: '改帽子',
      maskImage,
      sourceImage,
      aspectRatio: '16:9',
      imageSize: '2K',
      image2Options: { responseFormat: 'url' },
    }),
    {
      prompt: '改帽子',
      imageModel: 'image2',
      aspectRatio: '16:9',
      imageSize: '2K',
      image2Options: { responseFormat: 'url' },
      referenceImages: [{ data: 'source', mimeType: 'image/png' }],
      maskImage,
    }
  );
});
