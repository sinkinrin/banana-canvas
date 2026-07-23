import express from 'express';
import { createLocalProjectStore } from '../lib/localProjectStore';
import { mountGenerationRoutes, type GenerationProviders } from './generationRoutes';
import { mountProjectRoutes } from './projectsRoutes';
import type { RuntimeConfigManager } from './runtimeConfig';
import { mountRuntimeSettingsRoutes, type RuntimeSettingsStore } from './runtimeSettings';

export function createApp({
  dataDir,
  providers,
  runtimeConfig,
  runtimeSettings,
  development = false,
}: {
  dataDir: string;
  providers: GenerationProviders;
  runtimeConfig?: RuntimeConfigManager;
  runtimeSettings?: RuntimeSettingsStore;
  development?: boolean;
}) {
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    const scriptPolicy = development ? "'self' 'unsafe-eval'" : "'self'";
    res.setHeader('Content-Security-Policy', [
      "default-src 'self'",
      `script-src ${scriptPolicy}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: http: https:",
      "connect-src 'self' http: https: ws: wss:",
      "font-src 'self' data:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join('; '));
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use(express.json({ limit: '50mb' }));
  app.use((error: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    const bodyError = error as { type?: unknown; status?: unknown };
    if (bodyError.type === 'entity.too.large' || bodyError.status === 413) {
      res.status(413).json({ error: '请求体过大' });
      return;
    }
    if (error instanceof SyntaxError) {
      res.status(400).json({ error: '请求 JSON 格式无效' });
      return;
    }
    next(error);
  });
  if (runtimeSettings) mountRuntimeSettingsRoutes(app, runtimeSettings);
  mountProjectRoutes(app, createLocalProjectStore(dataDir));
  mountGenerationRoutes(app, { providers, runtimeConfig });
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API 路径不存在' });
  });
  return app;
}
