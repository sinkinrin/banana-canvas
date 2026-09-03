import assert from 'node:assert/strict';
import test from 'node:test';

import { getNativeAppMessages, normalizeNativeAppLanguage } from './nativeAppMessages';

test('native app language normalization follows English and Chinese system locales', () => {
  assert.equal(normalizeNativeAppLanguage('zh-Hans'), 'zh-CN');
  assert.equal(normalizeNativeAppLanguage('en-US'), 'en');
  assert.equal(normalizeNativeAppLanguage('fr-FR'), 'en');
});

test('native update and startup messages are localized', () => {
  assert.match(getNativeAppMessages('en').updateDownloaded('1.2.3'), /Version 1\.2\.3/);
  assert.match(getNativeAppMessages('zh-CN').updateDownloaded('1.2.3'), /版本 1\.2\.3/);
  assert.match(getNativeAppMessages('en').unsignedDetail, /not code-signed/);
  assert.match(getNativeAppMessages('zh-CN').unsignedDetail, /未进行代码签名/);
});
