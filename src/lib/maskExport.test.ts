import test from 'node:test';
import assert from 'node:assert/strict';

import { createOpenAiEditMaskPixels } from './maskExport';

test('createOpenAiEditMaskPixels converts painted pixels to transparent edit areas', () => {
  const source = new Uint8ClampedArray([
    242, 193, 78, 255,
    242, 193, 78, 128,
    0, 0, 0, 0,
  ]);

  const result = createOpenAiEditMaskPixels(source);

  assert.deepEqual(Array.from(result), [
    255, 255, 255, 0,
    255, 255, 255, 127,
    255, 255, 255, 255,
  ]);
});
