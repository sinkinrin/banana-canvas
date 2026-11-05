// Runs only on an isolated GitHub Actions Windows runner: never alter a user's installation.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

if (process.platform !== 'win32' || process.env.GITHUB_ACTIONS !== 'true' || !process.env.RUNNER_TEMP) {
  throw new Error('Installer upgrade smoke is restricted to isolated GitHub Actions Windows runners.');
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { version } = require(path.join(root, 'package.json'));
const previousTag = process.argv[2] ?? 'v0.13.0';
if (previousTag !== 'v0.13.0') throw new Error('This upgrade fixture targets v0.13.0.');
const stage = mkdtempSync(path.join(path.resolve(process.env.RUNNER_TEMP), 'banana-installer-upgrade-'));
const profile = mkdtempSync(path.join(tmpdir(), 'banana-electron-smoke-upgrade-'));
const destination = path.join(stage, 'installed');
const executable = path.join(destination, '香蕉画图.exe');
const oldInstaller = path.join(stage, 'banana-canvas-setup-0.13.0.exe');
const newInstaller = path.join(root, 'release', `banana-canvas-setup-${version}.exe`);

async function run(command, args, overrides = {}, timeoutMs = 300000) {
  const environment = { ...process.env, ...overrides };
  // Only gh needs GitHub authentication. The installed applications receive no publishing credentials.
  if (command !== 'gh') { delete environment.GH_TOKEN; delete environment.GITHUB_TOKEN; }
  const child = spawn(command, args, { cwd: root, env: environment, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', data => process.stdout.write(data));
  child.stderr.on('data', data => process.stderr.write(data));
  const timer = setTimeout(() => child.kill(), timeoutMs);
  try {
    await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', (code, signal) => code === 0 && !signal ? resolve() : reject(new Error(`Upgrade smoke child failed: code=${code}, signal=${signal}`)));
    });
  } finally { clearTimeout(timer); }
}
try {
  if (!existsSync(newInstaller)) throw new Error('Build the new installer before testing an upgrade.');
  // Download the old installer for the installation test, never for manual checksum verification.
  await run('gh', ['release', 'download', previousTag, '--repo', 'sinkinrin/banana-canvas', '--pattern', path.basename(oldInstaller), '--dir', stage], {}, 120000);
  await run(oldInstaller, ['/S', `/D=${destination}`], {}, 180000);
  if (!existsSync(executable)) throw new Error('The old installer did not create the expected executable.');
  const smoke = { BANANA_SMOKE_TEST: '1', BANANA_SMOKE_USER_DATA_DIR: profile,
    BANANA_CUTOUT_SMOKE_IMAGE: path.join(root, 'scripts', 'fixtures', 'cutout-portrait.jpg'), BANANA_SKIP_CUTOUT_INFERENCE: '1' };
  // The actual old application creates the encrypted credentials, project assets, comparison preferences and focused draft.
  await run(executable, [], { ...smoke, BANANA_SMOKE_RESTART: '0' });
  // Install in exactly the same directory, retaining the same application identity and profile.
  await run(newInstaller, ['/S', `/D=${destination}`], {}, 180000);
  await run(executable, [], { ...smoke, BANANA_SMOKE_RESTART: '1', BANANA_SMOKE_UPGRADE_FROM: '0.13.0', BANANA_SMOKE_EXPECT_VERSION: version });
  console.info(`[banana:upgrade] NSIS v0.13.0 -> v${version} installed over the same directory; old credentials, projects, preferences and draft survived; official provider passed`);
} finally {
  for (const [directory, parent, prefix] of [[stage, path.resolve(process.env.RUNNER_TEMP), 'banana-installer-upgrade-'], [profile, path.resolve(tmpdir()), 'banana-electron-smoke-upgrade-']]) {
    if (path.dirname(directory) !== parent || !path.basename(directory).startsWith(prefix)) throw new Error('Unexpected upgrade fixture directory');
    rmSync(directory, { recursive: true, force: true });
  }
}
