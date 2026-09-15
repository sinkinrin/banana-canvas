import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { DesktopTitleBar } from './DesktopTitleBar';
import i18n from '../i18n';
import type { DesktopWindowBridge } from '../lib/desktopWindow';

test('browser pages do not render desktop window controls', () => {
  assert.equal(renderToStaticMarkup(<DesktopTitleBar />), '');
});

test('desktop titlebar has localized accessible controls and a separate drag region', async () => {
  const bridge: DesktopWindowBridge = {
    getState: async () => ({ maximized: false }), minimize: async () => {},
    toggleMaximize: async () => {}, close: async () => {}, subscribe: () => () => {},
  };
  for (const [language, label] of [['zh-CN', '关闭窗口'], ['en', 'Close window']]) {
    await i18n.changeLanguage(language);
    const html = renderToStaticMarkup(<DesktopTitleBar bridge={bridge} />);
    assert.match(html, /desktop-titlebar-drag/);
    assert.match(html, /desktop-window-controls/);
    assert.equal((html.match(/data-window-action=/g) ?? []).length, 3);
    assert.ok(html.includes(`aria-label="${label}"`));
  }
  await i18n.changeLanguage('zh-CN');
});
