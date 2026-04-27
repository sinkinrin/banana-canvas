import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';

import { ProjectNameDialog } from './ProjectNameDialog';

test('ProjectNameDialog renders labels, form, and initial value', () => {
  const html = renderToStaticMarkup(
    <ProjectNameDialog
      title="新建项目"
      initialValue="未命名项目"
      confirmLabel="创建"
      cancelLabel="取消"
      onConfirm={() => {}}
      onCancel={() => {}}
    />
  );

  assert.match(html, /新建项目/);
  assert.match(html, /value="未命名项目"/);
  assert.match(html, /type="submit"/);
  assert.match(html, /创建/);
  assert.match(html, /取消/);
});
