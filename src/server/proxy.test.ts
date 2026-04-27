import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getConfiguredProxyUrl,
  getImage2ProxyMode,
  readBooleanEnv,
  readNonNegativeIntEnv,
  readPositiveIntEnv,
  redactProxyUrl,
} from './proxy';

test('redactProxyUrl hides credentials while preserving host details', () => {
  assert.equal(
    redactProxyUrl('http://user:secret@127.0.0.1:7890'),
    'http://***:***@127.0.0.1:7890/'
  );
});

test('env readers clamp invalid and out-of-range values', () => {
  assert.equal(readPositiveIntEnv({ VALUE: '0' }, 'VALUE', 5), 5);
  assert.equal(readPositiveIntEnv({ VALUE: '12.8' }, 'VALUE', 5, 10), 10);
  assert.equal(readPositiveIntEnv({ VALUE: 'not-a-number' }, 'VALUE', 5), 5);
  assert.equal(readNonNegativeIntEnv({ VALUE: '-1' }, 'VALUE', 2), 2);
  assert.equal(readNonNegativeIntEnv({ VALUE: '3.9' }, 'VALUE', 2), 3);
  assert.equal(readNonNegativeIntEnv({ VALUE: '12' }, 'VALUE', 2, 4), 4);
  assert.equal(readBooleanEnv({ VALUE: 'yes' }, 'VALUE'), true);
  assert.equal(readBooleanEnv({ VALUE: '0' }, 'VALUE', true), false);
  assert.equal(readBooleanEnv({ VALUE: 'maybe' }, 'VALUE', true), true);
});

test('getConfiguredProxyUrl prefers image2-specific proxy', () => {
  assert.equal(
    getConfiguredProxyUrl({
      IMAGE2_HTTPS_PROXY: 'http://image2-proxy',
      HTTPS_PROXY: 'http://https-proxy',
      HTTP_PROXY: 'http://http-proxy',
    }),
    'http://image2-proxy'
  );
});

test('getImage2ProxyMode reads mode using the configured proxy presence', () => {
  assert.equal(getImage2ProxyMode('http://proxy', { IMAGE2_PROXY_MODE: 'proxy' }), 'proxy');
  assert.equal(getImage2ProxyMode('', { IMAGE2_PROXY_MODE: 'auto' }), 'auto');
  assert.equal(getImage2ProxyMode('http://proxy', { IMAGE2_PROXY_MODE: 'bad' }), 'direct');
});
