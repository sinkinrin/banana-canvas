import express from 'express';
import { createLocalProjectStore } from '../lib/localProjectStore';
import { mountGenerationRoutes, type GenerationProviders } from './generationRoutes';
import { mountProjectRoutes } from './projectsRoutes';

export function createApp({
  dataDir,
  providers,
}: {
  dataDir: string;
  providers: GenerationProviders;
}) {
  const app = express();
  app.use(express.json({ limit: '50mb' }));
  mountProjectRoutes(app, createLocalProjectStore(dataDir));
  mountGenerationRoutes(app, { providers });
  return app;
}
