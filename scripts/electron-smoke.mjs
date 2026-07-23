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
const child = spawn(packagedExecutable ?? electronPath, electronArgs, {
  cwd: rootDir,
  env: {
    ...process.env,
    BANANA_SMOKE_TEST: '1',
    BANANA_SMOKE_USER_DATA_DIR: smokeUserDataDir,
  },
  stdio: 'inherit',
  windowsHide: true,
});

const timeout = setTimeout(() => {
  console.error('[banana:smoke] timed out');
  child.kill();
}, 60_000);
timeout.unref?.();

child.once('error', (error) => {
  clearTimeout(timeout);
  rmSync(smokeUserDataDir, { recursive: true, force: true });
  console.error('[banana:smoke] could not start Electron', error);
  process.exitCode = 1;
});

child.once('exit', (code, signal) => {
  clearTimeout(timeout);
  rmSync(smokeUserDataDir, { recursive: true, force: true });
  if (signal) {
    console.error(`[banana:smoke] Electron terminated by ${signal}`);
    process.exitCode = 1;
    return;
  }
  process.exitCode = code ?? 1;
});
