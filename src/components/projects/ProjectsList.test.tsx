import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';

import { ProjectsList } from './ProjectsList';

test('ProjectsList renders the empty state when there are no projects', () => {
  const html = renderToStaticMarkup(
    <ProjectsList
      projects={[]}
      onCreate={() => {}}
      onOpen={() => {}}
      onRename={() => {}}
      onDelete={() => {}}
    />
  );

  assert.match(html, /创建第一个项目/);
});

test('ProjectsList renders project names in the provided order', () => {
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
