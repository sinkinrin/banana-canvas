import test from 'node:test';
import assert from 'node:assert/strict';

import { getProjectPath, parseAppRoute } from './routes';

test('parseAppRoute recognizes the project details page', () => {
  assert.deepEqual(parseAppRoute('/projects/abc-123'), {
    name: 'project',
    projectId: 'abc-123',
  });
});

test('parseAppRoute decodes encoded project ids', () => {
  assert.deepEqual(parseAppRoute('/projects/a%2Fb%20c%25'), {
    name: 'project',
    projectId: 'a/b c%',
  });
});

test('parseAppRoute falls back to the projects index', () => {
  assert.deepEqual(parseAppRoute('/unknown/path'), {
    name: 'projects',
  });
});

test('parseAppRoute falls back to the projects index for malformed encoding', () => {
  assert.deepEqual(parseAppRoute('/projects/%E0%A4%A'), {
    name: 'projects',
  });
});

test('getProjectPath builds the canonical project URL', () => {
  assert.equal(getProjectPath('abc-123'), '/projects/abc-123');
});

test('getProjectPath encodes project ids', () => {
  assert.equal(getProjectPath('a/b c%'), '/projects/a%2Fb%20c%25');
});
