import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildBananaProviderRequest,
  extractBananaProviderImageUrl,
} from './banana';

test('buildBananaProviderRequest preserves prompt, model options, and inline references', () => {
  const request = buildBananaProviderRequest({
    prompt: 'draw',
    aspectRatio: '16:9',
    imageSize: '1K',
    images: [{ data: Buffer.from('ref').toString('base64'), mimeType: 'image/png' }],
    bananaOptions: { thinkingLevel: 'HIGH' },
  }) as any;

  assert.equal(request.model, 'gemini-3.1-flash-image-preview');
  assert.equal(request.contents.parts[0].inlineData.mimeType, 'image/png');
  assert.equal(request.contents.parts[0].inlineData.data, Buffer.from('ref').toString('base64'));
  assert.equal(request.contents.parts[1].text, 'draw');
  assert.equal(request.config.imageConfig.aspectRatio, '16:9');
  assert.equal(request.config.imageConfig.imageSize, '1K');
  assert.equal(request.config.thinkingConfig.thinkingLevel, 'HIGH');
});

test('extractBananaProviderImageUrl returns a data URL from provider image parts', () => {
  assert.equal(
    extractBananaProviderImageUrl({
      candidates: [{
        content: {
          parts: [{ inlineData: { mimeType: 'image/png', data: 'abc' } }],
        },
      }],
    }),
    'data:image/png;base64,abc'
  );
});
