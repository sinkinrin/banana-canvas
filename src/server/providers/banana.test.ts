import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildBananaProviderRequest,
  extractBananaProviderImageUrl,
} from './banana';

test('buildBananaProviderRequest preserves prompt, model options, and inline references', () => {
  const request = buildBananaProviderRequest({
    imageModel: 'banana',
    prompt: 'draw',
    aspectRatio: '16:9',
    imageSize: '1K',
    images: [{ data: Buffer.from('ref').toString('base64'), mimeType: 'image/png' }],
    bananaOptions: { thinkingLevel: 'HIGH' },
  }) as any;

  assert.equal(request.model, 'gemini-3.1-flash-image');
  assert.equal(request.contents.parts[0].inlineData.mimeType, 'image/png');
  assert.equal(request.contents.parts[0].inlineData.data, Buffer.from('ref').toString('base64'));
  assert.equal(request.contents.parts[1].text, 'draw');
  assert.equal(request.config.imageConfig.aspectRatio, '16:9');
  assert.equal(request.config.imageConfig.imageSize, '1K');
  assert.equal(request.config.thinkingConfig.thinkingLevel, 'HIGH');
});

test('buildBananaProviderRequest selects Lite and Pro API models', () => {
  const lite = buildBananaProviderRequest({
    imageModel: 'banana-lite',
    prompt: 'fast draft',
    aspectRatio: '1:8',
    imageSize: '4K',
    images: [],
    bananaOptions: { thinkingLevel: 'HIGH', searchGrounding: true },
  }) as any;
  assert.equal(lite.model, 'gemini-3.1-flash-lite-image');
  assert.deepEqual(lite.config.imageConfig, { aspectRatio: '1:8', imageSize: '1K' });
  assert.deepEqual(lite.config.thinkingConfig, { thinkingLevel: 'HIGH' });
  assert.equal('tools' in lite.config, false);

  const pro = buildBananaProviderRequest({
    imageModel: 'banana-pro',
    prompt: 'professional asset',
    aspectRatio: '16:9',
    imageSize: '4K',
    images: [],
    bananaOptions: { searchGrounding: true },
  }) as any;
  assert.equal(pro.model, 'gemini-3-pro-image');
  assert.deepEqual(pro.config.imageConfig, { aspectRatio: '16:9', imageSize: '4K' });
  assert.deepEqual(pro.config.tools, [{ googleSearch: {} }]);
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
