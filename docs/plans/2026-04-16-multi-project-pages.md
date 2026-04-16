# Multi-Project Pages Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build local-only multi-project support with a project list page and dedicated project URLs while preserving existing single-canvas users through automatic migration.

**Architecture:** Use a small client-side path router and IndexedDB-backed project storage. Keep one in-memory canvas store active at a time; load the current project snapshot into the store on navigation and autosave changes back to the active project key. Add a lightweight project index for metadata and keep existing Gemini API endpoints unchanged.

**Tech Stack:** React 19, TypeScript, Zustand, idb-keyval, node:test, tsx

---

### Task 1: Add route parsing helpers

**Files:**
- Create: `src/lib/routes.ts`
- Test: `src/lib/routes.test.ts`

**Step 1: Write the failing test**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';

import { getProjectPath, parseAppRoute } from './routes';

test('parseAppRoute recognizes the project details page', () => {
  assert.deepEqual(parseAppRoute('/projects/abc-123'), {
    name: 'project',
    projectId: 'abc-123',
  });
});

test('parseAppRoute falls back to the projects index', () => {
  assert.deepEqual(parseAppRoute('/unknown/path'), {
    name: 'projects',
  });
});

test('getProjectPath builds the canonical project URL', () => {
  assert.equal(getProjectPath('abc-123'), '/projects/abc-123');
});
```

**Step 2: Run test to verify it fails**

Run: `npx tsx --test src/lib/routes.test.ts`

Expected: FAIL with `Cannot find module './routes'` or `parseAppRoute is not a function`

**Step 3: Write minimal implementation**

```ts
export type AppRoute =
  | { name: 'projects' }
  | { name: 'project'; projectId: string };

export function parseAppRoute(pathname: string): AppRoute {
  const match = pathname.match(/^\/projects\/([^/]+)$/);
  if (match) {
    return { name: 'project', projectId: decodeURIComponent(match[1]) };
  }
  return { name: 'projects' };
}

export function getProjectPath(projectId: string) {
  return `/projects/${encodeURIComponent(projectId)}`;
}
```

**Step 4: Run test to verify it passes**

Run: `npx tsx --test src/lib/routes.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/routes.ts src/lib/routes.test.ts
git commit -m "test: add app route helpers"
```

### Task 2: Add project metadata helpers

**Files:**
- Create: `src/lib/projects.ts`
- Test: `src/lib/projects.test.ts`

**Step 1: Write the failing test**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';

import { createProjectMeta, renameProject, sortProjectsByUpdatedAt } from './projects';

test('new projects receive a trimmed name and timestamps', () => {
  const project = createProjectMeta('  海报方案  ');
  assert.equal(project.name, '海报方案');
  assert.ok(project.id);
  assert.ok(project.createdAt);
  assert.equal(project.updatedAt, project.createdAt);
});

test('renameProject updates the project name and updated timestamp', () => {
  const original = {
    id: 'p1',
    name: '旧名字',
    createdAt: '2026-04-16T10:00:00.000Z',
    updatedAt: '2026-04-16T10:00:00.000Z',
  };

  const renamed = renameProject(original, ' 新名字 ');

  assert.equal(renamed.name, '新名字');
  assert.notEqual(renamed.updatedAt, original.updatedAt);
});

test('sortProjectsByUpdatedAt orders newest projects first', () => {
  const sorted = sortProjectsByUpdatedAt([
    { id: 'a', name: 'A', createdAt: '', updatedAt: '2026-04-16T09:00:00.000Z' },
    { id: 'b', name: 'B', createdAt: '', updatedAt: '2026-04-16T11:00:00.000Z' },
  ]);

  assert.deepEqual(sorted.map((project) => project.id), ['b', 'a']);
});
```

**Step 2: Run test to verify it fails**

Run: `npx tsx --test src/lib/projects.test.ts`

Expected: FAIL with `Cannot find module './projects'`

**Step 3: Write minimal implementation**

```ts
import { v4 as uuidv4 } from 'uuid';

export type ProjectMeta = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export function createProjectMeta(name: string): ProjectMeta {
  const now = new Date().toISOString();
  const trimmed = name.trim() || '未命名项目';
  return {
    id: uuidv4(),
    name: trimmed,
    createdAt: now,
    updatedAt: now,
  };
}

export function renameProject(project: ProjectMeta, nextName: string): ProjectMeta {
  return {
    ...project,
    name: nextName.trim() || '未命名项目',
    updatedAt: new Date().toISOString(),
  };
}

export function sortProjectsByUpdatedAt(projects: ProjectMeta[]) {
  return [...projects].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}
```

**Step 4: Run test to verify it passes**

Run: `npx tsx --test src/lib/projects.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/projects.ts src/lib/projects.test.ts
git commit -m "test: add project metadata helpers"
```

### Task 3: Add IndexedDB-backed project storage and legacy migration

**Files:**
- Create: `src/lib/projectStorage.ts`
- Test: `src/lib/projectStorage.test.ts`
- Reference: `src/store.ts`
- Reference: `src/lib/canvasState.ts`

**Step 1: Write the failing test**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createMemoryProjectStorage,
  migrateLegacyCanvasIfNeeded,
  saveProjectSnapshot,
  loadProjectSnapshot,
  loadProjectIndex,
} from './projectStorage';

test('saveProjectSnapshot writes a project snapshot and updates the index timestamp', async () => {
  const storage = createMemoryProjectStorage();
  await storage.seedIndex([
    { id: 'p1', name: '项目 1', createdAt: '2026-04-16T10:00:00.000Z', updatedAt: '2026-04-16T10:00:00.000Z' },
  ]);

  await saveProjectSnapshot(storage.adapter, 'p1', { nodes: [], edges: [], assets: {} });

  const snapshot = await loadProjectSnapshot(storage.adapter, 'p1');
  const index = await loadProjectIndex(storage.adapter);

  assert.deepEqual(snapshot, { nodes: [], edges: [], assets: {} });
  assert.equal(index.length, 1);
  assert.notEqual(index[0].updatedAt, '2026-04-16T10:00:00.000Z');
});

test('migrateLegacyCanvasIfNeeded creates a default project from the old single-canvas keys', async () => {
  const storage = createMemoryProjectStorage();
  await storage.seedLegacyCanvas({
    nodes: [{ id: 'n1', type: 'promptNode', position: { x: 0, y: 0 }, data: { prompt: 'banana' } }],
    edges: [],
    assets: {},
  });

  const projectId = await migrateLegacyCanvasIfNeeded(storage.adapter);
  const index = await loadProjectIndex(storage.adapter);
  const snapshot = await loadProjectSnapshot(storage.adapter, projectId!);

  assert.equal(index.length, 1);
  assert.equal(index[0].name, '未命名项目');
  assert.equal(snapshot?.nodes.length, 1);
});
```

**Step 2: Run test to verify it fails**

Run: `npx tsx --test src/lib/projectStorage.test.ts`

Expected: FAIL with `Cannot find module './projectStorage'`

**Step 3: Write minimal implementation**

```ts
export const PROJECT_INDEX_KEY = 'banana-projects-index';
export const PROJECT_KEY_PREFIX = 'banana-project:';

export type ProjectSnapshot = {
  nodes: AppNode[];
  edges: Edge[];
  assets: Record<string, CanvasImageAsset>;
};

export async function loadProjectIndex(adapter: StorageAdapter): Promise<ProjectMeta[]> {
  return (await adapter.get(PROJECT_INDEX_KEY)) ?? [];
}

export async function saveProjectSnapshot(adapter: StorageAdapter, projectId: string, snapshot: ProjectSnapshot) {
  await adapter.set(`${PROJECT_KEY_PREFIX}${projectId}`, snapshot);
  const index = await loadProjectIndex(adapter);
  await adapter.set(PROJECT_INDEX_KEY, index.map((project) =>
    project.id === projectId
      ? { ...project, updatedAt: new Date().toISOString() }
      : project
  ));
}

export async function migrateLegacyCanvasIfNeeded(adapter: StorageAdapter) {
  // Read old single-canvas payload, create default project, persist new keys, return project id.
}
```

**Step 4: Run test to verify it passes**

Run: `npx tsx --test src/lib/projectStorage.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/projectStorage.ts src/lib/projectStorage.test.ts
git commit -m "test: add project storage and legacy migration"
```

### Task 4: Add canvas snapshot import/export helpers

**Files:**
- Create: `src/lib/projectSession.ts`
- Test: `src/lib/projectSession.test.ts`
- Modify: `src/store.ts`

**Step 1: Write the failing test**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';

import { createEmptyProjectSnapshot, normalizeProjectSnapshot } from './projectSession';

test('createEmptyProjectSnapshot returns an empty canvas payload', () => {
  assert.deepEqual(createEmptyProjectSnapshot(), {
    nodes: [],
    edges: [],
    assets: {},
  });
});

test('normalizeProjectSnapshot preserves nodes, edges and assets', () => {
  const snapshot = normalizeProjectSnapshot({
    nodes: [{ id: 'n1', type: 'promptNode', position: { x: 0, y: 0 }, data: { prompt: 'banana' } }],
    edges: [],
    assets: {},
  });

  assert.equal(snapshot.nodes.length, 1);
  assert.equal(snapshot.edges.length, 0);
});
```

**Step 2: Run test to verify it fails**

Run: `npx tsx --test src/lib/projectSession.test.ts`

Expected: FAIL with `Cannot find module './projectSession'`

**Step 3: Write minimal implementation**

```ts
export function createEmptyProjectSnapshot(): ProjectSnapshot {
  return { nodes: [], edges: [], assets: {} };
}

export function normalizeProjectSnapshot(snapshot?: Partial<ProjectSnapshot>): ProjectSnapshot {
  return {
    nodes: snapshot?.nodes ?? [],
    edges: snapshot?.edges ?? [],
    assets: snapshot?.assets ?? {},
  };
}
```

Then extend `src/store.ts` with explicit project-session methods:

```ts
hydrateProject(snapshot: ProjectSnapshot): void;
exportProject(): ProjectSnapshot;
```

Keep the existing node, edge and asset mutation APIs unchanged.

**Step 4: Run test to verify it passes**

Run: `npx tsx --test src/lib/projectSession.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/projectSession.ts src/lib/projectSession.test.ts src/store.ts
git commit -m "refactor: add project session helpers to canvas store"
```

### Task 5: Add the projects list page

**Files:**
- Create: `src/components/projects/ProjectsList.tsx`
- Create: `src/components/projects/ProjectsList.test.tsx`
- Create: `src/pages/ProjectsPage.tsx`
- Modify: `src/App.tsx`

**Step 1: Write the failing test**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';

import { ProjectsList } from './ProjectsList';

test('ProjectsList renders the empty state when there are no projects', () => {
  const html = renderToStaticMarkup(
    <ProjectsList projects={[]} onCreate={() => {}} onOpen={() => {}} onRename={() => {}} onDelete={() => {}} />
  );

  assert.match(html, /创建第一个项目/);
});

test('ProjectsList renders project names in updated order', () => {
  const html = renderToStaticMarkup(
    <ProjectsList
      projects={[
        { id: 'b', name: '项目 B', createdAt: '', updatedAt: '2026-04-16T11:00:00.000Z' },
        { id: 'a', name: '项目 A', createdAt: '', updatedAt: '2026-04-16T09:00:00.000Z' },
      ]}
      onCreate={() => {}}
      onOpen={() => {}}
      onRename={() => {}}
      onDelete={() => {}}
    />
  );

  assert.ok(html.indexOf('项目 B') < html.indexOf('项目 A'));
});
```

**Step 2: Run test to verify it fails**

Run: `npx tsx --test src/components/projects/ProjectsList.test.tsx`

Expected: FAIL with `Cannot find module './ProjectsList'`

**Step 3: Write minimal implementation**

```tsx
export function ProjectsList({ projects, onCreate, onOpen, onRename, onDelete }: ProjectsListProps) {
  if (projects.length === 0) {
    return <div>创建第一个项目</div>;
  }

  return (
    <div>
      {projects.map((project) => (
        <article key={project.id}>
          <h2>{project.name}</h2>
          <button onClick={() => onOpen(project.id)}>打开</button>
          <button onClick={() => onRename(project.id)}>重命名</button>
          <button onClick={() => onDelete(project.id)}>删除</button>
        </article>
      ))}
      <button onClick={onCreate}>新建项目</button>
    </div>
  );
}
```

Then add `ProjectsPage.tsx` to load the project index, create projects, and navigate to the selected project path.

**Step 4: Run test to verify it passes**

Run: `npx tsx --test src/components/projects/ProjectsList.test.tsx`

Expected: PASS

**Step 5: Commit**

```bash
git add src/components/projects/ProjectsList.tsx src/components/projects/ProjectsList.test.tsx src/pages/ProjectsPage.tsx src/App.tsx
git commit -m "feat: add local projects list page"
```

### Task 6: Add the project canvas page and autosave wiring

**Files:**
- Create: `src/components/projects/MissingProjectState.tsx`
- Create: `src/components/projects/MissingProjectState.test.tsx`
- Create: `src/pages/ProjectCanvasPage.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/Canvas.tsx`
- Modify: `src/store.ts`

**Step 1: Write the failing test**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';

import { MissingProjectState } from './MissingProjectState';

test('MissingProjectState explains that the project was not found', () => {
  const html = renderToStaticMarkup(<MissingProjectState onBack={() => {}} />);
  assert.match(html, /项目不存在/);
});
```

**Step 2: Run test to verify it fails**

Run: `npx tsx --test src/components/projects/MissingProjectState.test.tsx`

Expected: FAIL with `Cannot find module './MissingProjectState'`

**Step 3: Write minimal implementation**

```tsx
export function MissingProjectState({ onBack }: { onBack: () => void }) {
  return (
    <div>
      <h1>项目不存在</h1>
      <button onClick={onBack}>返回项目列表</button>
    </div>
  );
}
```

Then implement `ProjectCanvasPage.tsx`:

- Parse `projectId` from the current route
- Load project metadata and snapshot
- If missing, render `MissingProjectState`
- If found, hydrate the canvas store
- Subscribe to store changes and autosave the active project snapshot
- Add a compact header with back navigation and inline rename

**Step 4: Run test to verify it passes**

Run: `npx tsx --test src/components/projects/MissingProjectState.test.tsx`

Expected: PASS

**Step 5: Commit**

```bash
git add src/components/projects/MissingProjectState.tsx src/components/projects/MissingProjectState.test.tsx src/pages/ProjectCanvasPage.tsx src/App.tsx src/components/Canvas.tsx src/store.ts
git commit -m "feat: add project canvas page with autosave"
```

### Task 7: Verify the migration path and finish documentation

**Files:**
- Modify: `README.md`
- Reference: `docs/plans/2026-04-16-multi-project-pages-design.md`

**Step 1: Write the failing verification test**

Use the migration test already added in `src/lib/projectStorage.test.ts` and extend it with a “do nothing if index already exists” case:

```ts
test('migrateLegacyCanvasIfNeeded is a no-op when the new project index already exists', async () => {
  const storage = createMemoryProjectStorage();
  await storage.seedIndex([
    { id: 'p1', name: '项目 1', createdAt: '2026-04-16T10:00:00.000Z', updatedAt: '2026-04-16T10:00:00.000Z' },
  ]);
  await storage.seedLegacyCanvas({ nodes: [], edges: [], assets: {} });

  const migrated = await migrateLegacyCanvasIfNeeded(storage.adapter);
  const index = await loadProjectIndex(storage.adapter);

  assert.equal(migrated, null);
  assert.equal(index.length, 1);
});
```

**Step 2: Run test to verify it fails**

Run: `npx tsx --test src/lib/projectStorage.test.ts`

Expected: FAIL because the migration function is too eager

**Step 3: Write minimal implementation**

Adjust `migrateLegacyCanvasIfNeeded` to return early when the new project index is already present.

Update `README.md`:

- Add the new projects page flow
- Mention that project data is browser-local
- Document the migration behavior at a high level

**Step 4: Run full verification**

Run:

```bash
npx tsx --test src/lib/routes.test.ts
npx tsx --test src/lib/projects.test.ts
npx tsx --test src/lib/projectStorage.test.ts
npx tsx --test src/lib/projectSession.test.ts
npx tsx --test src/components/projects/ProjectsList.test.tsx
npx tsx --test src/components/projects/MissingProjectState.test.tsx
npx tsx --test src/lib/canvasState.test.ts
npx tsx --test src/components/nodes/PromptTextarea.test.tsx
npm run lint
npm run build
```

Expected: All tests PASS, typecheck PASS, build PASS

**Step 5: Commit**

```bash
git add README.md src/lib/projectStorage.test.ts
git commit -m "docs: document local multi-project support"
```
