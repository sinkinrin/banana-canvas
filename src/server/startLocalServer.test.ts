import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import net, { type AddressInfo } from 'node:net';

import { startLocalServer } from './startLocalServer';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function createProductionRoot(prefix: string) {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.mkdirSync(path.join(rootDir, 'dist'));
  fs.writeFileSync(path.join(rootDir, 'dist', 'index.html'), '<!doctype html><title>Banana App</title>');
  return rootDir;
}

test('startLocalServer serves production dist and exposes the selected local URL', async () => {
  const rootDir = createProductionRoot('banana-local-server-');
  const dataDir = path.join(rootDir, 'app-data');

  const server = await startLocalServer({
    rootDir,
    env: {
      NODE_ENV: 'production',
      BANANA_DATA_DIR: dataDir,
    },
    envFilePath: path.join(rootDir, '.env'),
    host: '127.0.0.1',
    port: 0,
    watchEnv: false,
    logger: () => {},
  });

  try {
    assert.match(server.url, /^http:\/\/127\.0\.0\.1:\d+$/);

    const response = await fetch(server.url);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), '<!doctype html><title>Banana App</title>');

    const initialSettings = await fetch(`${server.url}/api/runtime-settings`);
    assert.equal(initialSettings.status, 200);
    assert.equal((await initialSettings.json() as any).image2.ready, false);

    const savedSettings = await fetch(`${server.url}/api/runtime-settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image2: {
          baseUrl: 'https://relay.example/v1',
          apiKey: 'relay-key',
          model: 'gpt-image-2',
          endpointType: 'images',
          proxyMode: 'direct',
          stream: false,
          partialImages: 1,
          maxAttempts: 1,
          requestTimeoutMs: 240000,
        },
      }),
    });
    assert.equal(savedSettings.status, 200);
    const savedBody = await savedSettings.json() as any;
    assert.equal(savedBody.image2.ready, true);
    assert.equal(savedBody.image2.apiKeyConfigured, true);
    assert.equal(JSON.stringify(savedBody).includes('relay-key'), false);
    assert.match(fs.readFileSync(path.join(rootDir, '.env'), 'utf8'), /IMAGE2_API_KEY="relay-key"/);
  } finally {
    await server.close();
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('startLocalServer binds to loopback by default', async () => {
  const rootDir = createProductionRoot('banana-local-server-loopback-');
  const server = await startLocalServer({
    rootDir,
    env: {
      NODE_ENV: 'production',
      BANANA_DATA_DIR: path.join(rootDir, 'app-data'),
    },
    envFilePath: path.join(rootDir, '.env'),
    port: 0,
    watchEnv: false,
    logger: () => {},
  });

  try {
    assert.match(server.url, /^http:\/\/127\.0\.0\.1:\d+$/);
  } finally {
    await server.close();
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('startLocalServer rejects invalid npm env files without rewriting them', async () => {
  const rootDir = createProductionRoot('banana-local-server-strict-env-');
  const envFilePath = path.join(rootDir, '.env');
  const invalidText = 'IMAGE2_BASE_URL="not a url"\n';
  fs.writeFileSync(envFilePath, invalidText);

  try {
    await assert.rejects(
      startLocalServer({
        rootDir,
        env: {
          NODE_ENV: 'production',
          BANANA_DATA_DIR: path.join(rootDir, 'app-data'),
        },
        envFilePath,
        port: 0,
        watchEnv: false,
        logger: () => {},
      }),
      /Invalid runtime env/
    );
    assert.equal(fs.readFileSync(envFilePath, 'utf8'), invalidText);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('startLocalServer cleans up startup resources when the listen port is occupied', async () => {
  const rootDir = createProductionRoot('banana-local-server-listen-failure-');
  const occupied = net.createServer();
  occupied.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => occupied.once('listening', resolve));
  const port = (occupied.address() as AddressInfo).port;

  try {
    await assert.rejects(startLocalServer({
      rootDir,
      env: {
        NODE_ENV: 'production',
        BANANA_DATA_DIR: path.join(rootDir, 'app-data'),
      },
      envFilePath: path.join(rootDir, '.env'),
      host: '127.0.0.1',
      port,
      watchEnv: true,
      logger: () => {},
    }), /EADDRINUSE/);
  } finally {
    await new Promise<void>((resolve) => occupied.close(() => resolve()));
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('startLocalServer mounts Vite middleware for npm development mode', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'banana-local-server-dev-'));
  const server = await startLocalServer({
    rootDir: repoRoot,
    env: {
      NODE_ENV: 'development',
      BANANA_DATA_DIR: path.join(tempDir, 'app-data'),
    },
    envFilePath: path.join(tempDir, '.env'),
    host: '127.0.0.1',
    port: 0,
    watchEnv: false,
    logger: () => {},
  });

  try {
    const response = await fetch(server.url);
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.match(html, /<div id="root"><\/div>/);
    assert.match(html, /@vite\/client/);
  } finally {
    await server.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('startLocalServer repairs legacy invalid desktop settings and still exposes the settings UI', async () => {
  const rootDir = createProductionRoot('banana-local-server-repair-');
  const envFilePath = path.join(rootDir, '.env');
  fs.writeFileSync(envFilePath, [
    '# old desktop settings',
    'IMAGE2_BASE_URL="not a url"',
    'IMAGE2_API_KEY="preserved-key"',
    'IMAGE2_MODEL="gpt-image-2"',
  ].join('\n'));

  const server = await startLocalServer({
    rootDir,
    env: {
      NODE_ENV: 'production',
      BANANA_DATA_DIR: path.join(rootDir, 'app-data'),
    },
    envFilePath,
    envFilePrecedence: 'file',
    host: '127.0.0.1',
    port: 0,
    watchEnv: false,
    repairInvalidEnvFile: true,
    logger: () => {},
  });

  try {
    const response = await fetch(`${server.url}/api/runtime-settings`);
    assert.equal(response.status, 200);
    const settings = await response.json() as any;
    assert.equal(settings.image2.baseUrl, '');
    assert.equal(settings.image2.apiKeyConfigured, true);
    assert.equal(settings.image2.ready, false);

    const repaired = fs.readFileSync(envFilePath, 'utf8');
    assert.match(repaired, /# old desktop settings/);
    assert.match(repaired, /IMAGE2_BASE_URL=""/);
    assert.match(repaired, /IMAGE2_API_KEY="preserved-key"/);
  } finally {
    await server.close();
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('startLocalServer lets desktop user settings override inherited runtime values', async () => {
  const rootDir = createProductionRoot('banana-local-server-precedence-');
  const envFilePath = path.join(rootDir, '.env');
  fs.writeFileSync(envFilePath, [
    'IMAGE2_BASE_URL="https://desktop.example/v1"',
    'IMAGE2_API_KEY="desktop-key"',
    'IMAGE2_MODEL="gpt-image-2"',
  ].join('\n'));

  const server = await startLocalServer({
    rootDir,
    env: {
      NODE_ENV: 'production',
      BANANA_DATA_DIR: path.join(rootDir, 'app-data'),
      IMAGE2_BASE_URL: 'https://inherited.example/v1',
      IMAGE2_API_KEY: 'inherited-key',
    },
    envFilePath,
    envFilePrecedence: 'file',
    host: '127.0.0.1',
    port: 0,
    watchEnv: false,
    logger: () => {},
  });

  try {
    const response = await fetch(`${server.url}/api/runtime-settings`);
    const settings = await response.json() as any;
    assert.equal(settings.image2.baseUrl, 'https://desktop.example/v1');
    assert.equal(settings.image2.ready, true);
  } finally {
    await server.close();
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});
