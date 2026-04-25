import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';

import { ProjectsPageView } from './ProjectsPage';

test('ProjectsPageView renders a loading state while local projects are read', () => {
  const html = renderToStaticMarkup(
    <ProjectsPageView
      status="loading"
      projects={[]}
      onCreate={() => {}}
      onOpen={() => {}}
      onRename={() => {}}
      onDelete={() => {}}
    />
  );

  assert.match(html, /加载项目中/);
});

test('ProjectsPageView renders project list actions when ready', () => {
  const html = renderToStaticMarkup(
    <ProjectsPageView
      status="ready"
      projects={[
        {
          id: 'p1',
          name: '海报项目',
          createdAt: '2026-04-16T10:00:00.000Z',
          updatedAt: '2026-04-16T10:00:00.000Z',
        },
      ]}
      onCreate={() => {}}
      onOpen={() => {}}
      onRename={() => {}}
      onDelete={() => {}}
    />
  );

  assert.match(html, /海报项目/);
  assert.match(html, /新建项目/);
});

test('ProjectsPageView renders storage errors without hiding navigation context', () => {
  const html = renderToStaticMarkup(
    <ProjectsPageView
      status="error"
      errorMessage="IndexedDB unavailable"
      projects={[]}
      onCreate={() => {}}
      onOpen={() => {}}
      onRename={() => {}}
      onDelete={() => {}}
    />
  );

  assert.match(html, /项目加载失败/);
  assert.match(html, /IndexedDB unavailable/);
});
