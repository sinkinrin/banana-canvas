import type express from 'express';

import type { LocalPromptStore } from '../lib/localPromptStore';

function sendPromptError(res: express.Response, error: unknown) {
  const message = error instanceof Error ? error.message : '提示词库操作失败';
  const status = message.startsWith('Invalid prompt')
    || message.startsWith('Prompt content')
    || message.startsWith('Prompt title')
    || message.startsWith('Prompt tags')
    || message.includes('limit reached')
    ? 400
    : 500;
  if (status === 500) {
    console.error('[prompts] local storage operation failed:', error);
    res.status(500).json({ error: '提示词库操作失败' });
    return;
  }
  res.status(status).json({ error: message });
}

export function mountPromptRoutes(app: express.Express, promptStore: LocalPromptStore) {
  app.get('/api/prompts', async (_req, res) => {
    try {
      res.json({ prompts: await promptStore.list() });
    } catch (error) {
      sendPromptError(res, error);
    }
  });

  app.post('/api/prompts', async (req, res) => {
    try {
      res.json({ prompt: await promptStore.create(req.body) });
    } catch (error) {
      sendPromptError(res, error);
    }
  });

  app.patch('/api/prompts/:promptId', async (req, res) => {
    try {
      const prompt = await promptStore.update(req.params.promptId, req.body);
      if (!prompt) {
        res.status(404).json({ error: '提示词不存在' });
        return;
      }
      res.json({ prompt });
    } catch (error) {
      sendPromptError(res, error);
    }
  });

  app.delete('/api/prompts/:promptId', async (req, res) => {
    try {
      const deleted = await promptStore.delete(req.params.promptId);
      if (!deleted) {
        res.status(404).json({ error: '提示词不存在' });
        return;
      }
      res.json({ ok: true });
    } catch (error) {
      sendPromptError(res, error);
    }
  });
}
