import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';

import { RuntimeSettingsDialog } from './RuntimeSettingsDialog';

test('RuntimeSettingsDialog exposes the local auto-loading configuration workflow', () => {
  const html = renderToStaticMarkup(<RuntimeSettingsDialog onClose={() => {}} />);

  assert.match(html, /应用设置/);
  assert.match(html, /aria-label="界面语言"/);
  assert.match(html, /data-language-selector="true"/);
  assert.match(html, /模型与连接/);
  assert.match(html, /软件更新/);
  assert.match(html, /加载配置中/);
});
