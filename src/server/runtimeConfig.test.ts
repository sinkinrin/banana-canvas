import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  createRuntimeConfigManager,
  watchRuntimeEnvFile,
  type RuntimeConfigLogEntry,
} from './runtimeConfig';

function validImage2Env(overrides: Record<string, string | undefined> = {}) {
  return {
    IMAGE2_BASE_URL: 'https://relay.example/v1',
    IMAGE2_API_KEY: 'relay-key',
    IMAGE2_MODEL: 'gpt-image-2',
    IMAGE2_ENDPOINT_TYPE: 'images',
    IMAGE2_STREAM: 'false',
    IMAGE2_PARTIAL_IMAGES: '1',
    IMAGE2_PROXY_MODE: 'direct',
    IMAGE2_MAX_ATTEMPTS: '1',
    IMAGE2_RETRY_DELAY_MS: '1000',
    IMAGE2_REQUEST_TIMEOUT_MS: '240000',
    IMAGE2_PROXY_CONNECT_TIMEOUT_MS: '60000',
    IMAGE2_DIRECT_CONNECT_TIMEOUT_MS: '60000',
    IMAGE2_DIRECT_ALLOW_H2: 'true',
    IMAGE2_HEDGE_ENABLED: 'false',
    ...overrides,
  };
}

test('runtime config rejects invalid reloads and keeps the previous valid config', () => {
  const logs: RuntimeConfigLogEntry[] = [];
  const manager = createRuntimeConfigManager(validImage2Env(), {
    logger: (entry) => logs.push(entry),
  });

  const result = manager.reload(validImage2Env({ IMAGE2_BASE_URL: '"https://relay.example/v1' }));

  assert.equal(result.ok, false);
  assert.equal(manager.get().env.IMAGE2_BASE_URL, 'https://relay.example/v1');
  assert.equal(
    logs.some((entry) =>
      entry.level === 'error' &&
      entry.message.includes('Runtime env reload rejected') &&
      entry.message.includes('IMAGE2_BASE_URL')
    ),
    true
  );
});

test('runtime config hot reloads safe values while warning for startup-only changes', () => {
  const logs: RuntimeConfigLogEntry[] = [];
  const manager = createRuntimeConfigManager(validImage2Env({
    PORT: '3000',
    BANANA_DATA_DIR: './data',
  }), {
    logger: (entry) => logs.push(entry),
  });

  const result = manager.reload(validImage2Env({
    IMAGE2_MODEL: 'custom-chat-model',
    IMAGE2_ENDPOINT_TYPE: 'chat',
    PORT: '4000',
    BANANA_DATA_DIR: './other-data',
  }));

  assert.equal(result.ok, true);
  assert.equal(manager.get().env.IMAGE2_MODEL, 'custom-chat-model');
  assert.equal(manager.get().env.IMAGE2_ENDPOINT_TYPE, 'chat');
  assert.equal(manager.get().startup.port, 3000);
  assert.equal(manager.get().startup.dataDir, path.resolve('./data'));
  assert.equal(
    logs.some((entry) =>
      entry.level === 'warn' &&
      entry.message.includes('restart required') &&
      entry.message.includes('PORT') &&
      entry.message.includes('BANANA_DATA_DIR')
    ),
    true
  );
});

test('runtime config watches .env with debounce and ignores invalid updates', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'banana-runtime-config-'));
  const envPath = path.join(tmpDir, '.env');
  const logs: RuntimeConfigLogEntry[] = [];
  const manager = createRuntimeConfigManager(validImage2Env({ IMAGE2_MODEL: 'old-model' }), {
    logger: (entry) => logs.push(entry),
  });

  fs.writeFileSync(envPath, [
    'IMAGE2_BASE_URL=https://relay.example/v1',
    'IMAGE2_API_KEY=relay-key',
    'IMAGE2_MODEL=old-model',
  ].join('\n'));

  const watcher = watchRuntimeEnvFile({
    envFilePath: envPath,
    manager,
    baseEnv: {},
    debounceMs: 20,
    logger: (entry) => logs.push(entry),
  });

  try {
    fs.writeFileSync(envPath, [
      'IMAGE2_BASE_URL=https://relay.example/v1',
      'IMAGE2_API_KEY=relay-key',
      'IMAGE2_MODEL=new-model',
    ].join('\n'));

    await assertEventually(() => {
      assert.equal(manager.get().env.IMAGE2_MODEL, 'new-model');
    });

    fs.writeFileSync(envPath, [
      'IMAGE2_BASE_URL=not a url',
      'IMAGE2_API_KEY=relay-key',
      'IMAGE2_MODEL=broken-model',
    ].join('\n'));

    await assertEventually(() => {
      assert.equal(
        logs.some((entry) => entry.level === 'error' && entry.message.includes('Runtime env reload rejected')),
        true
      );
    });

    assert.equal(manager.get().env.IMAGE2_MODEL, 'new-model');
  } finally {
    watcher.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

async function assertEventually(assertion: () => void) {
  const deadline = Date.now() + 1000;
  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }

  throw lastError;
}
