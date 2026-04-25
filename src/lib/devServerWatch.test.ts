import test from 'node:test';
import assert from 'node:assert/strict';

import { getLocalDataWatchIgnoreGlobs } from './devServerWatch';

test('getLocalDataWatchIgnoreGlobs ignores the default local project data directory', () => {
  assert.deepEqual(getLocalDataWatchIgnoreGlobs(), ['**/data/**']);
});

test('getLocalDataWatchIgnoreGlobs ignores custom data directories inside the workspace', () => {
  assert.deepEqual(getLocalDataWatchIgnoreGlobs('.banana-data'), ['**/data/**', '**/.banana-data/**']);
});
