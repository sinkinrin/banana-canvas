import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { prepareReleaseArtifacts } from './release-metadata.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const expectedTag = process.argv[2]?.trim();

try {
  if (!expectedTag) throw new Error('必须传入发布标签，例如 v0.3.0。');
  const result = await prepareReleaseArtifacts(rootDir, expectedTag);
  console.info(
    '[banana:release] verified v' + result.version + ' and generated release notes/checksums'
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
