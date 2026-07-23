import { spawn } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const releaseDir = path.join(rootDir, 'release');
const stagingDir = mkdtempSync(path.join(tmpdir(), 'banana-electron-builder-'));
const builderCli = path.join(rootDir, 'node_modules', 'electron-builder', 'out', 'cli', 'cli.js');

function runBuilder() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      builderCli,
      '--win',
      'nsis',
      `--config.directories.output=${stagingDir}`,
    ], {
      cwd: rootDir,
      env: process.env,
      stdio: 'inherit',
      windowsHide: true,
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`electron-builder terminated by ${signal}`));
        return;
      }
      if (code !== 0) {
        reject(new Error(`electron-builder exited with code ${code ?? 'unknown'}`));
        return;
      }
      resolve();
    });
  });
}

try {
  await runBuilder();
  rmSync(releaseDir, { recursive: true, force: true });
  cpSync(stagingDir, releaseDir, { recursive: true });
  console.info(`[banana:packaging] copied verified artifacts to ${releaseDir}`);
} finally {
  rmSync(stagingDir, { recursive: true, force: true });
}
