import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';

import { ConfirmDialog } from '../components/projects/ConfirmDialog';
import { ProjectNameDialog } from '../components/projects/ProjectNameDialog';
import { ProjectsPageView } from './ProjectsPage';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

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

test('project dialogs render without native browser prompt text', () => {
  const createHtml = renderToStaticMarkup(
    <ProjectNameDialog
      title="新建项目"
      initialValue="未命名项目"
      confirmLabel="创建"
      cancelLabel="取消"
      onConfirm={() => {}}
      onCancel={() => {}}
    />
  );
  const deleteHtml = renderToStaticMarkup(
    <ConfirmDialog
      title="删除项目"
      body="删除项目“海报项目”？此操作不会进入回收站。"
      confirmLabel="删除"
      cancelLabel="取消"
      onConfirm={() => {}}
      onCancel={() => {}}
    />
  );

  assert.match(createHtml, /新建项目/);
  assert.match(deleteHtml, /删除项目/);
});

test('ProjectsPage dialog callbacks are wired through the tested helper', () => {
  const source = readFileSync(path.join(rootDir, 'src/pages/ProjectsPage.tsx'), 'utf8');

  assert.match(source, /createProjectDialogCallbacks/);
  assert.doesNotMatch(source, /window\.prompt|window\.confirm/);
  assert.doesNotMatch(source, /const confirmCreate = async/);
  assert.doesNotMatch(source, /const confirmRename = async/);
  assert.doesNotMatch(source, /const confirmDelete = async/);
});
