import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createRuntimeConfigManager } from './runtimeConfig';
import {
  createRuntimeSettingsStore,
  parseRuntimeSettingsUpdate,
  RuntimeSettingsValidationError,
  updateDotEnvText,
} from './runtimeSettings';

test('updateDotEnvText preserves comments and unknown values while replacing settings once', () => {
  const updated = updateDotEnvText([
    '# keep this comment',
    'UNKNOWN_VALUE="keep-me"',
    'IMAGE2_MODEL="old-model"',
    'IMAGE2_MODEL="duplicate"',
    '',
  ].join('\n'), {
    IMAGE2_MODEL: 'gpt-image-2',
    IMAGE2_BASE_URL: 'https://relay.example/v1',
  });

  assert.match(updated, /# keep this comment/);
  assert.match(updated, /UNKNOWN_VALUE="keep-me"/);
  assert.equal((updated.match(/IMAGE2_MODEL=/g) ?? []).length, 1);
  assert.match(updated, /IMAGE2_MODEL="gpt-image-2"/);
  assert.match(updated, /IMAGE2_BASE_URL="https:\/\/relay\.example\/v1"/);
});

test('parseRuntimeSettingsUpdate validates bounded settings and supports explicit key clearing', () => {
  assert.deepEqual(parseRuntimeSettingsUpdate({
    image2: {
      endpointType: 'auto',
      clearApiKey: true,
      partialImages: 2,
      maxAttempts: 1,
      requestTimeoutMs: 300_000,
    },
  }), {
    IMAGE2_API_KEY: '',
    IMAGE2_ENDPOINT_TYPE: '',
    IMAGE2_PARTIAL_IMAGES: '2',
    IMAGE2_MAX_ATTEMPTS: '1',
    IMAGE2_REQUEST_TIMEOUT_MS: '300000',
  });

  assert.throws(
    () => parseRuntimeSettingsUpdate({ image2: { partialImages: 4 } }),
    RuntimeSettingsValidationError
  );

  assert.throws(
    () => parseRuntimeSettingsUpdate({ image2: { baseUrl: 'not a url' } }),
    (error: unknown) =>
      error instanceof RuntimeSettingsValidationError &&
      error.errors.includes('image2.baseUrl must be a valid URL')
  );

  assert.throws(
    () => parseRuntimeSettingsUpdate({ image2: { proxyUrl: 'ftp://proxy.example' } }),
    (error: unknown) =>
      error instanceof RuntimeSettingsValidationError &&
      error.errors.includes('image2.proxyUrl must use http or https')
  );

  assert.throws(
    () => parseRuntimeSettingsUpdate({ gemini: { proxyUrl: '', proxyEnabled: true } }),
    (error: unknown) =>
      error instanceof RuntimeSettingsValidationError &&
      error.errors.includes('gemini.proxyUrl is required when proxy is enabled')
  );
});

test('runtime settings store persists, reloads, and returns only key presence', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'banana-runtime-settings-'));
  const envFilePath = path.join(dir, '.env');
  const manager = createRuntimeConfigManager({ NODE_ENV: 'production' });
  const store = createRuntimeSettingsStore({
    envFilePath,
    baseEnv: { NODE_ENV: 'production' },
    manager,
  });

  try {
    const snapshot = store.update({
      image2: {
        baseUrl: 'https://relay.example/v1/chat/completions',
        apiKey: 'secret-relay-key',
        model: 'gpt-image-2',
        endpointType: 'auto',
        proxyMode: 'direct',
        stream: true,
        partialImages: 2,
        maxAttempts: 1,
        requestTimeoutMs: 300_000,
      },
      gemini: {
        apiKey: 'secret-gemini-key',
        proxyUrl: 'http://127.0.0.1:7890',
        proxyEnabled: true,
      },
    });

    assert.equal(snapshot.image2.baseUrl, 'https://relay.example/v1');
    assert.equal(snapshot.image2.apiKeyConfigured, true);
    assert.equal(snapshot.image2.ready, true);
    assert.equal(snapshot.gemini.apiKeyConfigured, true);
    assert.equal(snapshot.gemini.proxyUrl, 'http://127.0.0.1:7890');
    assert.equal(snapshot.gemini.proxyEnabled, true);
    assert.equal(JSON.stringify(snapshot).includes('secret-relay-key'), false);
    assert.equal(JSON.stringify(snapshot).includes('secret-gemini-key'), false);

    const saved = fs.readFileSync(envFilePath, 'utf8');
    assert.match(saved, /IMAGE2_API_KEY="secret-relay-key"/);
    assert.match(saved, /GEMINI_API_KEY="secret-gemini-key"/);
    assert.match(saved, /GEMINI_HTTPS_PROXY="http:\/\/127\.0\.0\.1:7890"/);
    assert.match(saved, /GEMINI_PROXY_ENABLED="true"/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('runtime settings store can keep desktop secrets out of the env file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'banana-runtime-secrets-'));
  const envFilePath = path.join(dir, '.env');
  fs.writeFileSync(envFilePath, 'GEMINI_API_KEY="legacy-key"\nIMAGE2_API_KEY="legacy-relay-key"\n');
  let secrets: Record<string, string> = {};
  const secretStore = {
    get: () => ({ ...secrets }),
    replace: (values: Record<string, string | undefined>) => {
      secrets = Object.fromEntries(
        Object.entries(values).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
      );
    },
  };
  const manager = createRuntimeConfigManager({ NODE_ENV: 'production' });
  const store = createRuntimeSettingsStore({
    envFilePath,
    baseEnv: { NODE_ENV: 'production' },
    manager,
    secretStore,
  });

  try {
    const snapshot = store.update({
      image2: {
        baseUrl: 'https://relay.example/v1',
        apiKey: 'encrypted-relay-key',
        model: 'gpt-image-2',
      },
      gemini: { apiKey: 'encrypted-gemini-key' },
    });

    const saved = fs.readFileSync(envFilePath, 'utf8');
    assert.equal(saved.includes('GEMINI_API_KEY'), false);
    assert.equal(saved.includes('IMAGE2_API_KEY'), false);
    assert.equal(saved.includes('encrypted-'), false);
    assert.deepEqual(secrets, {
      GEMINI_API_KEY: 'encrypted-gemini-key',
      IMAGE2_API_KEY: 'encrypted-relay-key',
    });
    assert.equal(snapshot.image2.ready, true);
    assert.equal(snapshot.gemini.apiKeyConfigured, true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
