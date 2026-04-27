import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import dotenv from 'dotenv';
import { getLocalDataWatchIgnoreGlobs } from './src/lib/devServerWatch';
import { createLocalProjectStore } from './src/lib/localProjectStore';
import { mountGenerationRoutes } from './src/server/generationRoutes';
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

function sendProjectRouteError(res: express.Response, error: unknown) {
  const message = error instanceof Error ? error.message : '本地项目存储失败';
  const status = message.includes('Invalid project id')
    ? 400
    : message.includes('Project not found')
      ? 404
      : 500;
  res.status(status).json({ error: message });
}

async function startServer() {
  // Proxy support: set HTTPS_PROXY or HTTP_PROXY environment variable to route
  // all outgoing Gemini API requests through a proxy.
  // Example: HTTPS_PROXY=http://127.0.0.1:7890
  const proxyUrl = getConfiguredProxyUrl();
  const image2ProxyMode = getImage2ProxyMode(proxyUrl);
  if (proxyUrl) {
    console.log(`[Proxy] Using proxy: ${redactProxyUrl(proxyUrl)} image2Mode=${image2ProxyMode}`);
    applyGlobalProxyFetch({ proxyUrl });
  }

  const app = express();
  const PORT = Number(process.env.PORT || 3000);
  const projectStore = createLocalProjectStore(getLocalDataDir());

  app.use(express.json({ limit: '50mb' }));

  // API routes FIRST
  app.get('/api/projects', async (_req, res) => {
    try {
      res.json({ projects: await projectStore.loadProjectIndex() });
    } catch (error) {
      sendProjectRouteError(res, error);
    }
  });

  app.post('/api/projects', async (req, res) => {
    try {
      const name = typeof req.body?.name === 'string' ? req.body.name : '未命名项目';
      const project = await projectStore.createProject(name, req.body?.snapshot);
      res.json({ project });
    } catch (error) {
      sendProjectRouteError(res, error);
    }
  });

  app.post('/api/projects/import', async (req, res) => {
    try {
      const projects = Array.isArray(req.body?.projects) ? req.body.projects : [];
      await projectStore.importProjects(projects);
      res.json({ ok: true });
    } catch (error) {
      sendProjectRouteError(res, error);
    }
  });

  app.get('/api/projects/:projectId', async (req, res) => {
    try {
      const project = await projectStore.loadProject(req.params.projectId);
      if (!project) {
        res.status(404).json({ error: '项目不存在' });
        return;
      }
      res.json(project);
    } catch (error) {
      sendProjectRouteError(res, error);
    }
  });

  app.put('/api/projects/:projectId', async (req, res) => {
    try {
      await projectStore.saveProjectSnapshot(req.params.projectId, req.body);
      res.json({ ok: true });
    } catch (error) {
      sendProjectRouteError(res, error);
    }
  });

  app.patch('/api/projects/:projectId', async (req, res) => {
    try {
      const name = typeof req.body?.name === 'string' ? req.body.name : '';
      const project = await projectStore.renameProject(req.params.projectId, name);
      if (!project) {
        res.status(404).json({ error: '项目不存在' });
        return;
      }
      res.json({ project });
    } catch (error) {
      sendProjectRouteError(res, error);
    }
  });

  app.delete('/api/projects/:projectId', async (req, res) => {
    try {
      await projectStore.deleteProject(req.params.projectId);
      res.json({ ok: true });
    } catch (error) {
      sendProjectRouteError(res, error);
    }
  });

  mountGenerationRoutes(app, {
    providers: {
      generateBananaImage,
      generateImage2Image,
    },
  });

  // Vite middleware for development
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
