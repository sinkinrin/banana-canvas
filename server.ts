import path from 'path';
import dotenv from 'dotenv';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { getLocalDataWatchIgnoreGlobs } from './src/lib/devServerWatch';
import { createApp } from './src/server/app';
import { generateBananaImage } from './src/server/providers/banana';
import { generateImage2Image } from './src/server/providers/image2';
import { syncRuntimeGlobalProxy } from './src/server/runtimeProxy';
import {
  createRuntimeConfigManager,
  watchRuntimeEnvFile,
  type RuntimeConfigLogger,
} from './src/server/runtimeConfig';

const baseProcessEnv = { ...process.env };
dotenv.config();

const runtimeLogger: RuntimeConfigLogger = (entry) => {
  if (entry.level === 'error') {
    console.error(entry.message);
  } else if (entry.level === 'warn') {
    console.warn(entry.message);
  } else {
    console.info(entry.message);
  }
};

async function startServer() {
  const runtimeConfig = createRuntimeConfigManager(process.env, { logger: runtimeLogger });
  const config = runtimeConfig.get();
  syncRuntimeGlobalProxy(runtimeConfig, { logger: runtimeLogger });

  const app = createApp({
    dataDir: config.startup.dataDir,
    providers: {
      generateBananaImage,
      generateImage2Image: (input) => generateImage2Image({ ...input, runtimeConfig }),
    },
    runtimeConfig,
  });
  const PORT = config.startup.port;

  watchRuntimeEnvFile({
    envFilePath: path.resolve(process.cwd(), '.env'),
    manager: runtimeConfig,
    baseEnv: baseProcessEnv,
    logger: runtimeLogger,
    onReloadSuccess: () => syncRuntimeGlobalProxy(runtimeConfig, { logger: runtimeLogger }),
  });

  if (config.startup.nodeEnv !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        watch: {
          ignored: getLocalDataWatchIgnoreGlobs(config.startup.dataDir),
        },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
