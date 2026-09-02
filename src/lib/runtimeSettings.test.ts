import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createRuntimeSettingsForm,
  createRuntimeSettingsUpdate,
  type RuntimeSettingsSnapshot,
} from './runtimeSettings';

const settings: RuntimeSettingsSnapshot = {
  autoLoad: true,
  image2: {
    baseUrl: 'https://relay.example/v1',
    apiKeyConfigured: true,
    model: 'gpt-image-2',
    endpointType: 'images',
    proxyUrl: '',
    proxyMode: 'direct',
    stream: false,
    partialImages: 1,
    maxAttempts: 1,
    requestTimeoutMs: 240_000,
    ready: true,
    missingKeys: [],
  },
  gemini: { apiKeyConfigured: false, proxyUrl: '', proxyEnabled: false },
};

test('runtime settings form auto-loads non-secret fields and never exposes saved keys', () => {
  const form = createRuntimeSettingsForm(settings);

  assert.equal(form.image2BaseUrl, 'https://relay.example/v1');
  assert.equal(form.image2Model, 'gpt-image-2');
  assert.equal(form.image2ApiKey, '');
  assert.equal(form.geminiApiKey, '');
  assert.equal(form.geminiProxyEnabled, false);
});

test('runtime settings update trims values and preserves keys when replacement fields stay blank', () => {
  const update = createRuntimeSettingsUpdate({
    ...createRuntimeSettingsForm(settings),
    image2BaseUrl: ' https://new.example/v1 ',
    image2ApiKey: '   ',
    geminiApiKey: ' AIza-new ',
    geminiProxyUrl: ' http://127.0.0.1:7890 ',
    geminiProxyEnabled: true,
  });

  assert.equal(update.image2?.baseUrl, 'https://new.example/v1');
  assert.equal('apiKey' in (update.image2 ?? {}), false);
  assert.equal(update.gemini?.apiKey, 'AIza-new');
  assert.equal(update.gemini?.proxyUrl, 'http://127.0.0.1:7890');
  assert.equal(update.gemini?.proxyEnabled, true);
});
