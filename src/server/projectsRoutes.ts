import express from 'express';
import type { LocalProjectStore } from '../lib/localProjectStore';

function sendProjectRouteError(res: express.Response, error: unknown) {
  const message = error instanceof Error ? error.message : '本地项目存储失败';
  const status = message.includes('Invalid project id')
    || message.includes('Invalid asset id')
    || message.includes('Project asset missing')
    || message.includes('Project asset file missing')
    || message.includes('Project asset mismatch')
    ? 400
    : message.includes('Project not found')
      ? 404
      : 500;
  res.status(status).json({ error: message });
}

function parseProjectAssetBody(body: unknown, assetId: string) {
  const asset = typeof body === 'object' && body !== null && 'asset' in body
    ? (body as { asset?: unknown }).asset
    : null;

  if (
    typeof asset !== 'object' ||
    asset === null ||
    !('mimeType' in asset) ||
    !('data' in asset) ||
    typeof (asset as { mimeType?: unknown }).mimeType !== 'string' ||
    typeof (asset as { data?: unknown }).data !== 'string'
  ) {
    return null;
  }

  return {
    id: assetId,
    mimeType: (asset as { mimeType: string }).mimeType,
    data: (asset as { data: string }).data,
  };
}

export function mountProjectRoutes(app: express.Express, projectStore: LocalProjectStore) {
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

  app.put('/api/projects/:projectId/assets/:assetId', async (req, res) => {
    try {
      const asset = parseProjectAssetBody(req.body, req.params.assetId);
      if (!asset) {
        res.status(400).json({ error: 'Invalid project asset payload' });
        return;
      }

      await projectStore.saveProjectAsset(req.params.projectId, asset);
      res.json({ ok: true });
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
}
