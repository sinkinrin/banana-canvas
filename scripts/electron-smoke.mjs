import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import electronPath from 'electron';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packagedExecutable = process.argv[2]
  ? path.resolve(rootDir, process.argv[2])
  : undefined;
const smokeUserDataDir = mkdtempSync(path.join(tmpdir(), 'banana-electron-smoke-'));
const electronArgs = packagedExecutable
  ? []
  : [...(process.platform === 'linux' ? ['--no-sandbox'] : []), '.'];
async function runStage(restart) {
  const child = spawn(packagedExecutable ?? electronPath, electronArgs, {
    cwd: rootDir,
    env: {
      ...process.env,
      BANANA_SMOKE_TEST: '1',
      BANANA_SMOKE_RESTART: restart ? '1' : '0',
      BANANA_SMOKE_USER_DATA_DIR: smokeUserDataDir,
      BANANA_CUTOUT_SMOKE_IMAGE: path.join(rootDir, 'scripts', 'fixtures', 'cutout-portrait.jpg'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  let timedOut = false;
  let closeTimeout;
  let outputTail = '';
  child.stdout.on('data', data => {
    process.stdout.write(data);
    outputTail = (outputTail + data.toString()).slice(-1000);
    if (!closeTimeout && outputTail.includes('[banana:smoke] requesting normal window close')) {
      closeTimeout = setTimeout(() => {
        timedOut = true;
        console.error('[banana:smoke] process remained alive after normal window close');
        child.kill();
      }, 15_000);
    }
  });
  child.stderr.on('data', data => process.stderr.write(data));
  const timeout = setTimeout(() => {
    timedOut = true;
    console.error('[banana:smoke] timed out');
    child.kill();
  }, process.env.BANANA_CUTOUT_OPTIONAL_SMOKE === '1' ? 420_000 : 300_000);
  timeout.unref?.();

  await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => {
      if (timedOut || signal || code !== 0) reject(new Error(`Electron smoke failed: code=${code}, signal=${signal}, timedOut=${timedOut}`));
      else if (!closeTimeout) reject(new Error('Electron exited without exercising normal window close'));
      else resolve();
    });
  }).finally(() => {
    clearTimeout(timeout);
    clearTimeout(closeTimeout);
  });
}

try {
  await runStage(false);
  await runStage(true);
  console.info('[banana:smoke] normal close, process exit, restart and saved draft recovery passed');
} catch (error) {
  console.error('[banana:smoke]', error);
  process.exitCode = 1;
} finally {
  rmSync(smokeUserDataDir, { recursive: true, force: true });
}
