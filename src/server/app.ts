import express from 'express';
import { createLocalProjectStore } from '../lib/localProjectStore';
import { mountGenerationRoutes, type GenerationProviders } from './generationRoutes';
import { mountProjectRoutes } from './projectsRoutes';
import type { RuntimeConfigManager } from './runtimeConfig';

export function createApp({
  dataDir,
  providers,
  runtimeConfig,
}: {
  dataDir: string;
  providers: GenerationProviders;
  runtimeConfig?: RuntimeConfigManager;
}) {
  const app = express();
  app.use(express.json({ limit: '50mb' }));
  mountProjectRoutes(app, createLocalProjectStore(dataDir));
  mountGenerationRoutes(app, { providers, runtimeConfig });
  return app;
}
