import assert from 'node:assert/strict';
import test from 'node:test';

import i18n, { detectLanguage, normalizeLanguage } from './index';

test('normalizeLanguage maps supported language families', () => {
  assert.equal(normalizeLanguage('en-US'), 'en');
  assert.equal(normalizeLanguage('zh-Hans-CN'), 'zh-CN');
  assert.equal(normalizeLanguage('fr-FR'), null);
});

test('detectLanguage prefers a persisted choice and falls back to supported browser languages', () => {
  assert.equal(detectLanguage({ requestedLanguage: 'en-US', storedLanguage: 'zh-CN' }), 'en');
  assert.equal(detectLanguage({ storedLanguage: 'zh-TW', browserLanguages: ['en-US'] }), 'zh-CN');
  assert.equal(detectLanguage({ storedLanguage: 'fr', browserLanguages: ['ja-JP', 'en-GB'] }), 'en');
  assert.equal(detectLanguage({ storedLanguage: null, browserLanguages: ['de-DE'] }), 'en');
});

test('English and Simplified Chinese resources support interpolation', async () => {
  await i18n.changeLanguage('en');
  assert.equal(i18n.t('projects.deleteConfirmation', { name: 'Poster' }), 'Delete “Poster”? The project will not be moved to the Recycle Bin.');

  await i18n.changeLanguage('zh-CN');
  assert.equal(i18n.t('projects.deleteConfirmation', { name: '海报' }), '删除项目“海报”？此操作不会进入回收站。');
});
