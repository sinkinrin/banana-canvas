import path from 'path';
import dotenv from 'dotenv';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { getLocalDataWatchIgnoreGlobs } from './src/lib/devServerWatch';
import { createApp } from './src/server/app';
import { generateBananaImage } from './src/server/providers/banana';
import { generateImage2Image } from './src/server/providers/image2';
import {
  applyGlobalProxyFetch,
  getConfiguredProxyUrl,
  getImage2ProxyMode,
  redactProxyUrl,
} from './src/server/proxy';

dotenv.config();

function getLocalDataDir() {
  const configured = process.env.BANANA_DATA_DIR?.trim();
  return configured ? path.resolve(configured) : path.join(process.cwd(), 'data');
}

async function startServer() {
  const proxyUrl = getConfiguredProxyUrl();
  const image2ProxyMode = getImage2ProxyMode(proxyUrl);
  if (proxyUrl) {
    console.log(`[Proxy] Using proxy: ${redactProxyUrl(proxyUrl)} image2Mode=${image2ProxyMode}`);
    applyGlobalProxyFetch({ proxyUrl });
  }

  const app = createApp({
    dataDir: getLocalDataDir(),
    providers: {
      generateBananaImage,
      generateImage2Image,
    },
  });
  const PORT = Number(process.env.PORT || 3000);

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        watch: {
          ignored: getLocalDataWatchIgnoreGlobs(),
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
