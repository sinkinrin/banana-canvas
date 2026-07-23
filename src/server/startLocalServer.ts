import http from 'node:http';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import express from 'express';
import type { ViteDevServer } from 'vite';
import { getLocalDataWatchIgnoreGlobs } from '../lib/devServerWatch';
import { createApp } from './app';
import { generateBananaImage } from './providers/banana';
import { generateImage2Image } from './providers/image2';
import { syncRuntimeGlobalProxy } from './runtimeProxy';
import {
  createRuntimeConfigManager,
  loadRuntimeEnvFile,
  recoverInvalidRuntimeEnv,
  repairInvalidRuntimeEnvFile,
  watchRuntimeEnvFile,
  type RuntimeConfigLogger,
  type RuntimeEnvFilePrecedence,
} from './runtimeConfig';
import {
  createRuntimeSettingsStore,
  type RuntimeSettingsSecretStore,
} from './runtimeSettings';
import type { EnvLike } from './proxy';

export type LocalServerHandle = {
  url: string;
  port: number;
  close: () => Promise<void>;
};

export type StartLocalServerOptions = {
  rootDir?: string;
  env?: EnvLike;
  envFilePath?: string;
  host?: string;
  port?: number;
  watchEnv?: boolean;
  envFilePrecedence?: RuntimeEnvFilePrecedence;
  repairInvalidEnvFile?: boolean;
  logger?: RuntimeConfigLogger;
  runtimeSecrets?: RuntimeSettingsSecretStore;
};

type Closable = {
  close: () => void | Promise<void>;
};

const defaultLogger: RuntimeConfigLogger = (entry) => {
  if (entry.level === 'error') {
    console.error(entry.message);
    return;
  }
  if (entry.level === 'warn') {
    console.warn(entry.message);
    return;
  }
  console.info(entry.message);
};

function closeHttpServer(server: http.Server | undefined) {
  if (!server?.listening) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

async function closeResource(resource: Closable | undefined) {
  if (!resource) return;
  await resource.close();
}

export async function startLocalServer({
  rootDir = process.cwd(),
  env = process.env,
  envFilePath,
  host,
  port,
  watchEnv = true,
  envFilePrecedence = 'base',
  repairInvalidEnvFile = false,
  logger = defaultLogger,
  runtimeSecrets,
}: StartLocalServerOptions = {}): Promise<LocalServerHandle> {
  const resolvedRootDir = path.resolve(rootDir);
  const resolvedEnvFilePath = path.resolve(envFilePath ?? path.join(resolvedRootDir, '.env'));
  const configuredHost = loadRuntimeEnvFile(
    resolvedEnvFilePath,
    env,
    envFilePrecedence
  ).HOST?.trim();
  const resolvedHost = host?.trim() || configuredHost || '127.0.0.1';
  const baseRecovery = recoverInvalidRuntimeEnv({
    ...env,
    ...(runtimeSecrets?.get() ?? {}),
  });
  if (baseRecovery.errors.length > 0) {
    logger({
      level: 'warn',
      message: `Ignoring invalid inherited runtime settings: ${baseRecovery.errors.join('; ')}`,
    });
  }
  const baseEnv = baseRecovery.env;

  if (repairInvalidEnvFile) {
    repairInvalidRuntimeEnvFile(resolvedEnvFilePath, { logger });
  }

  const loadEffectiveEnv = () => ({
    ...loadRuntimeEnvFile(resolvedEnvFilePath, baseEnv, envFilePrecedence),
    ...(runtimeSecrets?.get() ?? {}),
  });
  const loadedInitialEnv = loadEffectiveEnv();
  const initialRecovery = repairInvalidEnvFile
    ? recoverInvalidRuntimeEnv(loadedInitialEnv)
    : { env: loadedInitialEnv, errors: [], invalidKeys: [] };
  if (initialRecovery.errors.length > 0) {
    logger({
      level: 'warn',
      message: `Ignoring invalid initial runtime settings: ${initialRecovery.errors.join('; ')}`,
    });
  }

  const runtimeConfig = createRuntimeConfigManager(initialRecovery.env, { logger });
  const config = runtimeConfig.get();
  syncRuntimeGlobalProxy(runtimeConfig, { logger });
  const runtimeSettings = createRuntimeSettingsStore({
    envFilePath: resolvedEnvFilePath,
    baseEnv,
    envFilePrecedence,
    manager: runtimeConfig,
    secretStore: runtimeSecrets,
    onReloadSuccess: (manager) => syncRuntimeGlobalProxy(manager, { logger }),
  });

  const app = createApp({
    dataDir: config.startup.dataDir,
    development: config.startup.nodeEnv !== 'production',
    providers: {
      generateBananaImage,
      generateImage2Image: (input) => generateImage2Image({ ...input, runtimeConfig }),
    },
    runtimeConfig,
    runtimeSettings,
  });

  let envWatcher: ReturnType<typeof watchRuntimeEnvFile> | undefined;
  let viteServer: ViteDevServer | undefined;
  let server: http.Server | undefined;

  try {
    envWatcher = watchEnv
      ? watchRuntimeEnvFile({
          envFilePath: resolvedEnvFilePath,
          manager: runtimeConfig,
          baseEnv,
          envFilePrecedence,
          logger,
          envOverlay: () => runtimeSecrets?.get() ?? {},
          onReloadSuccess: () => syncRuntimeGlobalProxy(runtimeConfig, { logger }),
        })
      : undefined;

    if (config.startup.nodeEnv !== 'production') {
      const { createServer: createViteServer } = await import('vite');
      viteServer = await createViteServer({
        root: resolvedRootDir,
        server: {
          middlewareMode: true,
          watch: {
            ignored: getLocalDataWatchIgnoreGlobs(config.startup.dataDir),
          },
        },
        appType: 'spa',
      });
      app.use(viteServer.middlewares);
    } else {
      const distPath = path.join(resolvedRootDir, 'dist');
      app.use(express.static(distPath));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }

    server = http.createServer(app);
    await new Promise<void>((resolve, reject) => {
      server!.once('error', reject);
      server!.listen(port ?? config.startup.port, resolvedHost, () => {
        server!.off('error', reject);
        resolve();
      });
    });

    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Unable to determine local server address');
    }

    const selectedPort = (address as AddressInfo).port;
    const urlHost = resolvedHost === '0.0.0.0' || resolvedHost === '::'
      ? 'localhost'
      : resolvedHost.includes(':')
        ? `[${resolvedHost}]`
        : resolvedHost;
    let closed = false;

    return {
      url: `http://${urlHost}:${selectedPort}`,
      port: selectedPort,
      close: async () => {
        if (closed) return;
        closed = true;
        await closeHttpServer(server);
        envWatcher?.close();
        await closeResource(viteServer);
      },
    };
  } catch (error) {
    await closeHttpServer(server).catch(() => undefined);
    envWatcher?.close();
    await closeResource(viteServer).catch(() => undefined);
    throw error;
  }
}
