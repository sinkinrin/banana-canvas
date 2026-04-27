import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';

import { ConfirmDialog } from './ConfirmDialog';

test('ConfirmDialog renders destructive confirmation structure', () => {
  const html = renderToStaticMarkup(
    <ConfirmDialog
      title="删除项目"
      body="删除项目“海报项目”？此操作不会进入回收站。"
      confirmLabel="删除"
      cancelLabel="取消"
      onConfirm={() => {}}
      onCancel={() => {}}
    />
  );

  assert.match(html, /删除项目/);
  assert.match(html, /海报项目/);
  assert.match(html, /删除/);
  assert.match(html, /取消/);
  assert.match(html, /AlertTriangle|aria-hidden/);
});
