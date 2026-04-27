import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

async function readJsonFile<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(resolve(repoRoot, path), 'utf8')) as T;
}

test('package metadata uses the banana-canvas package name', async () => {
  const packageJson = await readJsonFile<{ name: string }>('package.json');
  const packageLock = await readJsonFile<{
    name: string;
    packages: Record<string, { name?: string }>;
  }>('package-lock.json');

  assert.equal(packageJson.name, 'banana-canvas');
  assert.equal(packageLock.name, 'banana-canvas');
  assert.equal(packageLock.packages[''].name, 'banana-canvas');
});

test('package scripts expose test and check commands', async () => {
  const packageJson = await readJsonFile<{
    scripts: Record<string, string>;
  }>('package.json');

  assert.equal(packageJson.scripts.test, 'tsx --test "src/**/*.test.ts" "src/**/*.test.tsx"');
  assert.equal(packageJson.scripts.check, 'npm run lint && npm test && npm run build');
});

test('README documents setup and verification commands', async () => {
  const readme = await readFile(resolve(repoRoot, 'README.md'), 'utf8');

  assert.match(readme, /npm install/);
  assert.match(readme, /npm test/);
  assert.match(readme, /npm run check/);
  assert.match(readme, /`npm install` 是首次设置步骤/);
  assert.match(readme, /`npm run check` 不会执行 `npm install`/);
});
