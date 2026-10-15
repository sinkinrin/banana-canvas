import { spawn } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElectronBuildConfig } from './electron-build-config.mjs';
import {
  embedReleaseNotesInLatestMetadata,
  validateVersionMetadata,
} from './release-metadata.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const releaseDir = path.join(rootDir, 'release');
const stagingDir = mkdtempSync(path.join(tmpdir(), 'banana-electron-builder-'));
const builderCli = path.join(rootDir, 'node_modules', 'electron-builder', 'out', 'cli', 'cli.js');
const configPath = path.join(stagingDir, 'build-config.json');

function runBuilder() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      builderCli,
      '--win',
      'nsis',
      '--publish',
      'never',
      '--config',
      configPath,
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
  const { changelog, version } = validateVersionMetadata(rootDir);
  const config = createElectronBuildConfig(rootDir, stagingDir);
  writeFileSync(configPath, JSON.stringify(config), 'utf8');
  console.info(`[banana:packaging] reuse Electron ${config.electronVersion} cache with bundled integrity metadata`);
  await runBuilder();
  unlinkSync(configPath);
  embedReleaseNotesInLatestMetadata(
    path.join(stagingDir, 'latest.yml'),
    changelog,
    version
  );
  rmSync(releaseDir, { recursive: true, force: true });
  cpSync(stagingDir, releaseDir, { recursive: true });
  console.info(`[banana:packaging] copied verified artifacts to ${releaseDir}`);
} finally {
  rmSync(stagingDir, { recursive: true, force: true });
}
