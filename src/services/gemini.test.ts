import test from 'node:test';
import assert from 'node:assert/strict';

import { createGenerateImagePayload, getGenerateImageTimeoutMs } from './gemini';

test('createGenerateImagePayload includes the selected image model without browser secrets', () => {
  assert.deepEqual(
    createGenerateImagePayload(
      {
        prompt: '画一只香蕉机器人',
        imageModel: 'image2',
        aspectRatio: '1:1',
        imageSize: '1K',
        image2Options: {
          quality: 'high',
          outputFormat: 'webp',
          outputCompression: 75,
          moderation: 'low',
          stream: 'on',
          partialImages: 2,
          user: 'ignored-end-user',
        } as any,
      }
    ),
    {
      prompt: '画一只香蕉机器人',
      imageModel: 'image2',
      aspectRatio: '1:1',
      imageSize: '1K',
      image2Options: {
        quality: 'high',
        outputFormat: 'webp',
        outputCompression: 75,
        partialImages: 2,
      },
    }
  );
});

test('createGenerateImagePayload includes mask images for Image2 edits', () => {
  assert.deepEqual(
    createGenerateImagePayload(
      {
        prompt: '把帽子改成红色',
        imageModel: 'image2',
        referenceImages: [{ data: 'original', mimeType: 'image/png' }],
        maskImage: { data: 'mask', mimeType: 'image/png' },
      }
    ),
    {
      prompt: '把帽子改成红色',
      imageModel: 'image2',
      referenceImages: [{ data: 'original', mimeType: 'image/png' }],
      maskImage: { data: 'mask', mimeType: 'image/png' },
    }
  );
});

test('createGenerateImagePayload includes normalized Banana2 advanced options', () => {
  assert.deepEqual(
    createGenerateImagePayload(
      {
        prompt: '画一只香蕉机器人',
        imageModel: 'banana',
        aspectRatio: '21:9',
        imageSize: '512px',
        bananaOptions: {
          responseMode: 'image',
          thinkingLevel: 'high',
          mediaResolution: 'MEDIA_RESOLUTION_MEDIUM',
          searchGrounding: true,
          safetySettings: {
            HARM_CATEGORY_HARASSMENT: 'BLOCK_ONLY_HIGH',
            HARM_CATEGORY_CIVIC_INTEGRITY: 'BLOCK_NONE',
          },
          outputFormat: 'png',
        } as any,
      }
    ),
    {
      prompt: '画一只香蕉机器人',
      imageModel: 'banana',
      aspectRatio: '21:9',
      imageSize: '512px',
      bananaOptions: {
        thinkingLevel: 'HIGH',
        mediaResolution: 'MEDIA_RESOLUTION_MEDIUM',
        searchGrounding: true,
      },
    }
  );
});

test('createGenerateImagePayload normalizes missing model selection to image2', () => {
  assert.deepEqual(
    createGenerateImagePayload(
      {
        prompt: '画一只香蕉机器人',
      }
    ),
    {
      prompt: '画一只香蕉机器人',
      imageModel: 'image2',
    }
  );
});

test('getGenerateImageTimeoutMs gives image2 a longer timeout than banana', () => {
  assert.equal(getGenerateImageTimeoutMs('banana'), 60000);
  assert.equal(getGenerateImageTimeoutMs('image2'), 300000);
});
