import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';

import { PromptLibraryDialog } from './PromptLibraryDialog';

test('prompt library dialog exposes reusable management and current-prompt capture', () => {
  const html = renderToStaticMarkup(
    <PromptLibraryDialog
      initialPrompt="一张电影感海报"
      onUsePrompt={() => {}}
      onClose={() => {}}
    />
  );

  assert.match(html, /提示词管理/);
  assert.match(html, /跨项目保存/);
  assert.match(html, /收藏当前提示词/);
  assert.match(html, /搜索标题、内容或标签/);
  assert.match(html, /新建提示词/);
});
