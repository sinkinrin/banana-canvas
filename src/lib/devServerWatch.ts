import path from 'node:path';

function toWatchGlob(segment: string) {
  return `**/${segment.replace(/\\/g, '/')}/**`;
}

export function getLocalDataWatchIgnoreGlobs(dataDir = process.env.BANANA_DATA_DIR) {
  const configured = dataDir?.trim();
  if (!configured) return [toWatchGlob('data')];

  const resolved = path.resolve(configured);
  const relative = path.relative(process.cwd(), resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return [toWatchGlob('data')];
  }

  return Array.from(new Set([toWatchGlob('data'), toWatchGlob(relative)]));
}
