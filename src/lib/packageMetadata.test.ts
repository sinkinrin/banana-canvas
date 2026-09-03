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
    version: string;
    packages: Record<string, { name?: string; version?: string }>;
  }>('package-lock.json');

  assert.equal(packageJson.name, 'banana-canvas');
  assert.match(packageJson.version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
  assert.match(packageJson.description, /Image2/);
  assert.equal(packageJson.author, 'Banana Canvas Contributors');
  assert.equal(packageLock.name, 'banana-canvas');
  assert.equal(packageLock.version, packageJson.version);
  assert.equal(packageLock.packages[''].name, 'banana-canvas');
  assert.equal(packageLock.packages[''].version, packageJson.version);
});

test('package scripts expose test and check commands', async () => {
  const packageJson = await readJsonFile<{
    scripts: Record<string, string>;
  }>('package.json');

  assert.equal(packageJson.scripts.test, 'node scripts/run-tests.mjs');
  assert.equal(
    packageJson.scripts.check,
    'npm run version:check && npm run typecheck && npm run lint && npm test && npm run build && npm run build:electron'
  );
  assert.equal(packageJson.scripts.typecheck, 'tsc --noEmit');
  assert.match(packageJson.scripts.lint, /eslint/);
  assert.match(packageJson.scripts['smoke:electron'], /electron-smoke/);
  assert.match(packageJson.scripts['smoke:electron:packaged'], /win-unpacked/);
  assert.match(packageJson.scripts.clean, /node:fs/);
  assert.match(packageJson.scripts['clean:release'], /release/);
  assert.match(packageJson.scripts['dist:win'], /clean:release/);
  assert.match(packageJson.scripts['dist:win'], /build-windows/);
  assert.equal(packageJson.scripts['version:check'], 'node scripts/verify-version.mjs');
  assert.equal(packageJson.scripts['release:prepare'], 'node scripts/prepare-release.mjs');
  assert.match(packageJson.scripts.electron, /electron \./);

  const buildWindows = await readFile(resolve(repoRoot, 'scripts/build-windows.mjs'), 'utf8');
  assert.match(buildWindows, /embedReleaseNotesInLatestMetadata/);
});

test('desktop packaging uses a stable update filename, custom icon, and excludes node_modules', async () => {
  const packageJson = await readJsonFile<{
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
    build: {
      files: string[];
      npmRebuild: boolean;
      publish: Array<{ provider: string; owner: string; repo: string }>;
      win: { icon: string; artifactName: string };
    };
  }>('package.json');

  assert.equal(packageJson.dependencies.vite, undefined);
  assert.match(packageJson.dependencies['electron-updater'], /^\^6\./);
  assert.equal(packageJson.devDependencies.vite, '^6.4.3');
  assert.equal(packageJson.build.npmRebuild, false);
  assert.equal(packageJson.build.win.icon, 'assets/icon.ico');
  assert.equal(packageJson.build.win.artifactName, 'banana-canvas-setup-${version}.${ext}');
  assert.equal(packageJson.build.files.includes('!node_modules{,/**/*}'), true);
  assert.deepEqual(packageJson.build.publish, [{
    provider: 'github',
    owner: 'sinkinrin',
    repo: 'banana-canvas',
  }]);
});

test('environment template keeps secrets blank and provides the default Image2 model', async () => {
  const envExample = await readFile(resolve(repoRoot, '.env.example'), 'utf8');

  assert.match(envExample, /^GEMINI_API_KEY=""$/m);
  assert.match(envExample, /^GEMINI_PROMPT_OPTIMIZER_MODEL="gemini-3\.8-flash"$/m);
  assert.match(envExample, /^IMAGE2_BASE_URL=""$/m);
  assert.match(envExample, /^IMAGE2_API_KEY=""$/m);
  assert.match(envExample, /^IMAGE2_MODEL="gpt-image-2"$/m);
  assert.doesNotMatch(envExample, /YOUR_IMAGE2|MY_GEMINI_API_KEY/);
});

test('English and Chinese READMEs stay concise, linked, and release-aware', async () => {
  const readme = await readFile(resolve(repoRoot, 'README.md'), 'utf8');
  const readmeCn = await readFile(resolve(repoRoot, 'README_CN.md'), 'utf8');
  const packageJson = await readJsonFile<{ version: string }>('package.json');

  assert.match(readme, /npm install/);
  assert.match(readme, /npm test/);
  assert.match(readme, /npm run check/);
  assert.match(readme, /`npm install` is the initial dependency setup step/);
  assert.match(readme, /does not run `npm install`/);
  assert.ok(readme.includes('Current version: `' + packageJson.version + '`'));
  assert.match(readme, /> \[!IMPORTANT\]\s*> 🇨🇳 \*\*简体中文：\[阅读中文 README\]\(README_CN\.md\)\*\*/);
  assert.match(readme, /Automatic updates are off by default/);
  assert.ok(readmeCn.includes('当前版本：`' + packageJson.version + '`'));
  assert.match(readmeCn, /\[Read the default README\]\(README\.md\)/);
  assert.ok(readme.split(/\r?\n/).length < 180);
  assert.ok(readmeCn.split(/\r?\n/).length < 180);
});

test('release workflow builds update metadata before creating GitHub Release', async () => {
  const workflow = await readFile(
    resolve(repoRoot, '.github/workflows/release.yml'),
    'utf8'
  );
  const changelog = await readFile(resolve(repoRoot, 'CHANGELOG.md'), 'utf8');
  const packageJson = await readJsonFile<{ version: string }>('package.json');

  assert.match(workflow, /tags:\s*\n\s*-\s*'v\*'/);
  assert.match(workflow, /runs-on: windows-latest/);
  assert.match(workflow, /npm run smoke:electron:packaged/);
  assert.match(workflow, /npm run release:prepare/);
  assert.match(workflow, /release\/latest\.yml/);
  assert.match(workflow, /gh release create/);
  assert.match(changelog, /^## \[Unreleased\]/m);
  assert.ok(changelog.includes('## [' + packageJson.version + ']'));
});
