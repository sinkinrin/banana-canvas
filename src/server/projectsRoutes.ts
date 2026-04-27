import express from 'express';
import type { LocalProjectStore } from '../lib/localProjectStore';

function sendProjectRouteError(res: express.Response, error: unknown) {
  const message = error instanceof Error ? error.message : '本地项目存储失败';
  const status = message.includes('Invalid project id')
    ? 400
    : message.includes('Project not found')
      ? 404
      : 500;
  res.status(status).json({ error: message });
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
