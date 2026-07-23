import test from 'node:test';
import assert from 'node:assert/strict';

import { isAllowedExternalUrl, isInternalAppUrl } from './electronNavigation';

test('isInternalAppUrl compares parsed origins instead of string prefixes', () => {
  const localUrl = 'http://127.0.0.1:3210';

  assert.equal(isInternalAppUrl('http://127.0.0.1:3210/projects/one', localUrl), true);
  assert.equal(isInternalAppUrl('http://127.0.0.1:3210.evil.example/', localUrl), false);
  assert.equal(isInternalAppUrl('http://127.0.0.1:3210@evil.example/', localUrl), false);
  assert.equal(isInternalAppUrl('not a url', localUrl), false);
});

test('isAllowedExternalUrl permits only http and https URLs', () => {
  assert.equal(isAllowedExternalUrl('https://example.com/help'), true);
  assert.equal(isAllowedExternalUrl('http://example.com/help'), true);
  assert.equal(isAllowedExternalUrl('file:///C:/secret.txt'), false);
  assert.equal(isAllowedExternalUrl('javascript:alert(1)'), false);
});
