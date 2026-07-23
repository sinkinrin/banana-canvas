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
  const packageJson = await readJsonFile<{
    name: string;
    version: string;
    description: string;
    author: string;
  }>('package.json');
  const packageLock = await readJsonFile<{
    name: string;
    packages: Record<string, { name?: string }>;
  }>('package-lock.json');

  assert.equal(packageJson.name, 'banana-canvas');
  assert.equal(packageJson.version, '0.2.1');
  assert.match(packageJson.description, /Image2/);
  assert.equal(packageJson.author, 'Banana Canvas Contributors');
  assert.equal(packageLock.name, 'banana-canvas');
  assert.equal(packageLock.packages[''].name, 'banana-canvas');
});

test('package scripts expose test and check commands', async () => {
  const packageJson = await readJsonFile<{
    scripts: Record<string, string>;
  }>('package.json');

  assert.equal(packageJson.scripts.test, 'node scripts/run-tests.mjs');
  assert.equal(
    packageJson.scripts.check,
    'npm run typecheck && npm run lint && npm test && npm run build && npm run build:electron'
  );
  assert.equal(packageJson.scripts.typecheck, 'tsc --noEmit');
  assert.match(packageJson.scripts.lint, /eslint/);
  assert.match(packageJson.scripts['smoke:electron'], /electron-smoke/);
  assert.match(packageJson.scripts['smoke:electron:packaged'], /win-unpacked/);
  assert.match(packageJson.scripts.clean, /node:fs/);
  assert.match(packageJson.scripts['clean:release'], /release/);
  assert.match(packageJson.scripts['dist:win'], /clean:release/);
  assert.match(packageJson.scripts['dist:win'], /build-windows/);
  assert.match(packageJson.scripts.electron, /electron \./);
});

test('desktop packaging uses a stable update filename, custom icon, and excludes node_modules', async () => {
  const packageJson = await readJsonFile<{
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
    build: {
      files: string[];
      npmRebuild: boolean;
      win: { icon: string; artifactName: string };
    };
  }>('package.json');

  assert.equal(packageJson.dependencies.vite, undefined);
  assert.equal(packageJson.devDependencies.vite, '^6.4.3');
  assert.equal(packageJson.build.npmRebuild, false);
  assert.equal(packageJson.build.win.icon, 'assets/icon.ico');
  assert.equal(packageJson.build.win.artifactName, 'banana-canvas-setup-${version}.${ext}');
  assert.equal(packageJson.build.files.includes('!node_modules{,/**/*}'), true);
});

test('environment template keeps secrets blank and provides the default Image2 model', async () => {
  const envExample = await readFile(resolve(repoRoot, '.env.example'), 'utf8');

  assert.match(envExample, /^GEMINI_API_KEY=""$/m);
  assert.match(envExample, /^IMAGE2_BASE_URL=""$/m);
  assert.match(envExample, /^IMAGE2_API_KEY=""$/m);
  assert.match(envExample, /^IMAGE2_MODEL="gpt-image-2"$/m);
  assert.doesNotMatch(envExample, /YOUR_IMAGE2|MY_GEMINI_API_KEY/);
});

test('README documents setup and verification commands', async () => {
  const readme = await readFile(resolve(repoRoot, 'README.md'), 'utf8');

  assert.match(readme, /npm install/);
  assert.match(readme, /npm test/);
  assert.match(readme, /npm run check/);
  assert.match(readme, /`npm install` 是首次设置步骤/);
  assert.match(readme, /`npm run check` 不会执行 `npm install`/);
});
