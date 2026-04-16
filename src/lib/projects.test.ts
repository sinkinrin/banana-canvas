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

  assert.deepEqual(
    sorted.map((project) => project.id),
    ['b', 'a']
  );
});
