import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

export function createElectronBuildConfig(rootDir, outputDir) {
  const require = createRequire(path.join(rootDir, 'package.json'));
  const packageJson = JSON.parse(readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
  const lock = JSON.parse(readFileSync(path.join(rootDir, 'package-lock.json'), 'utf8'));
  const { version } = require('electron/package.json');
  if (version !== lock.packages['node_modules/electron'].version) {
    throw new Error('Installed Electron does not match package-lock.json. Run npm ci first.');
  }

  return {
    ...packageJson.build,
    directories: { ...packageJson.build.directories, output: outputDir },
    electronVersion: version,
    electronDownload: {
      // Select ElectronGetOptions so electron-builder forwards the bundled
      // checksums. Its normal cache and integrity checks remain enabled, while
      // a cache hit no longer needs a network request for SHASUMS256.txt.
      mirrorOptions: {},
      checksums: require('electron/checksums.json'),
    },
  };
}
