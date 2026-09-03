import test from 'node:test';
import assert from 'node:assert/strict';

import {
  decodedBase64ByteLength,
  formatMebibytes,
  MAX_JSON_REQUEST_BODY_BYTES,
  MAX_REFERENCE_IMAGE_BYTES,
  MAX_TOTAL_INPUT_IMAGE_BYTES,
  MEBIBYTE_BYTES,
} from './imageInputLimits';

test('image input limits preserve headroom for base64 JSON requests', () => {
  assert.equal(MAX_REFERENCE_IMAGE_BYTES, 16 * MEBIBYTE_BYTES);
  assert.equal(MAX_TOTAL_INPUT_IMAGE_BYTES, 40 * MEBIBYTE_BYTES);
  assert.equal(MAX_JSON_REQUEST_BODY_BYTES, 64 * MEBIBYTE_BYTES);
  assert.ok(MAX_TOTAL_INPUT_IMAGE_BYTES * 4 / 3 < MAX_JSON_REQUEST_BODY_BYTES);
});

test('decodedBase64ByteLength validates padded and unpadded base64 without decoding it', () => {
  assert.equal(decodedBase64ByteLength('YQ=='), 1);
  assert.equal(decodedBase64ByteLength('YWI='), 2);
  assert.equal(decodedBase64ByteLength('YWJj'), 3);
  assert.equal(decodedBase64ByteLength('YQ'), 1);
  assert.equal(decodedBase64ByteLength(''), null);
  assert.equal(decodedBase64ByteLength('abc==='), null);
  assert.equal(decodedBase64ByteLength('abc\n'), null);
});

test('formatMebibytes renders concise user-facing sizes', () => {
  assert.equal(formatMebibytes(16 * MEBIBYTE_BYTES), '16 MiB');
  assert.equal(formatMebibytes(11.25 * MEBIBYTE_BYTES), '11.25 MiB');
  assert.equal(formatMebibytes(1.5 * MEBIBYTE_BYTES), '1.5 MiB');
  assert.equal(formatMebibytes(16 * MEBIBYTE_BYTES + 1), '16.01 MiB');
});
