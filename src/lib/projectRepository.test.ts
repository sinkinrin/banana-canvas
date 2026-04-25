import test from 'node:test';
import assert from 'node:assert/strict';

import { createMemoryProjectStorage } from './projectStorage';
import { createProjectRepository } from './projectRepository';

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
  } as Response;
}

test('project repository lists projects from the local API when available', async () => {
  const fetchCalls: string[] = [];
  const fetcher = async (input: RequestInfo | URL) => {
    fetchCalls.push(String(input));
    return jsonResponse({
      projects: [
        {
          id: 'p-local',
          name: '本地项目',
          createdAt: '2026-04-25T10:00:00.000Z',
          updatedAt: '2026-04-25T10:00:00.000Z',
        },
      ],
    });
  };

  const repository = createProjectRepository({ fetcher });
  const projects = await repository.listProjects();

  assert.equal(fetchCalls[0], '/api/projects');
  assert.equal(projects[0].id, 'p-local');
});

test('project repository falls back to IndexedDB storage when local API is unavailable', async () => {
  const storage = createMemoryProjectStorage();
  await storage.seedIndex([
    {
      id: 'p-idb',
      name: 'IndexedDB 项目',
      createdAt: '2026-04-25T10:00:00.000Z',
      updatedAt: '2026-04-25T10:00:00.000Z',
    },
  ]);

  const repository = createProjectRepository({
    storageAdapter: storage.adapter,
    fetcher: async () => {
      throw new Error('network down');
    },
  });

  const projects = await repository.listProjects();

  assert.equal(projects[0].id, 'p-idb');
});

test('project repository surfaces local API storage errors instead of falling back', async () => {
  const storage = createMemoryProjectStorage();
  await storage.seedIndex([
    {
      id: 'p-idb',
      name: 'IndexedDB 项目',
      createdAt: '2026-04-25T10:00:00.000Z',
      updatedAt: '2026-04-25T10:00:00.000Z',
    },
  ]);

  const repository = createProjectRepository({
    storageAdapter: storage.adapter,
    fetcher: async () => jsonResponse({ error: '本地项目存储失败' }, 500),
  });

  await assert.rejects(
    () => repository.listProjects(),
    /本地项目存储失败/
  );
});

test('project repository migrates IndexedDB projects into an empty local file store', async () => {
  const storage = createMemoryProjectStorage();
  await storage.seedIndex([
    {
      id: 'p-old',
      name: '旧项目',
      createdAt: '2026-04-25T10:00:00.000Z',
      updatedAt: '2026-04-25T10:00:00.000Z',
    },
  ]);
  await storage.adapter.set('banana-project:p-old', {
    nodes: [
      {
        id: 'n1',
        type: 'promptNode',
        position: { x: 0, y: 0 },
        data: { prompt: 'banana' },
      },
    ],
    edges: [],
    assets: {},
  });

  const imports: unknown[] = [];
  let migrated = false;
  const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === '/api/projects' && !init) {
      return jsonResponse({
        projects: migrated
          ? [
              {
                id: 'p-old',
                name: '旧项目',
                createdAt: '2026-04-25T10:00:00.000Z',
                updatedAt: '2026-04-25T10:00:00.000Z',
              },
            ]
          : [],
      });
    }
    if (url === '/api/projects/import') {
      imports.push(JSON.parse(String(init?.body)));
      migrated = true;
      return jsonResponse({ ok: true });
    }
    throw new Error(`unexpected request ${url}`);
  };

  const repository = createProjectRepository({ storageAdapter: storage.adapter, fetcher });
  const projects = await repository.listProjects();

  assert.equal(projects[0].id, 'p-old');
  assert.deepEqual(imports, [
    {
      projects: [
        {
          project: {
            id: 'p-old',
            name: '旧项目',
            createdAt: '2026-04-25T10:00:00.000Z',
            updatedAt: '2026-04-25T10:00:00.000Z',
          },
          snapshot: {
            nodes: [
              {
                id: 'n1',
                type: 'promptNode',
                position: { x: 0, y: 0 },
                data: { prompt: 'banana' },
              },
            ],
            edges: [],
            assets: {},
          },
        },
      ],
    },
  ]);
});
