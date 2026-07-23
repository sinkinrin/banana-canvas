import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

function collectTests(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? collectTests(path) : [path];
    })
    .filter((path) => /\.test\.tsx?$/.test(path))
    .sort();
}

const tests = collectTests('src');

if (tests.length === 0) {
  console.error('No test files found under src/.');
  process.exit(1);
}

const result = spawnSync(
  process.execPath,
  ['--import', 'tsx', '--test', ...tests],
  { stdio: 'inherit' },
);

process.exit(result.status ?? 1);
