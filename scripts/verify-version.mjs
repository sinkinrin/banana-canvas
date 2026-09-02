import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateVersionMetadata } from './release-metadata.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

try {
  const { version } = validateVersionMetadata(rootDir);
  console.info('[banana:version] package, lockfile, README, and changelog agree on v' + version);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
