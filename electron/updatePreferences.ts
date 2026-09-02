import fs from 'node:fs';
import path from 'node:path';

export type DesktopUpdatePreferences = {
  automaticUpdatesEnabled: boolean;
};

const DEFAULT_PREFERENCES: DesktopUpdatePreferences = {
  automaticUpdatesEnabled: false,
};

export function createUpdatePreferencesStore(filePath: string) {
  const resolvedPath = path.resolve(filePath);

  const get = (): DesktopUpdatePreferences => {
    try {
      const parsed = JSON.parse(fs.readFileSync(resolvedPath, 'utf8')) as {
        automaticUpdatesEnabled?: unknown;
      };
      return {
        automaticUpdatesEnabled: parsed.automaticUpdatesEnabled === true,
      };
    } catch {
      return { ...DEFAULT_PREFERENCES };
    }
  };

  const replace = (preferences: DesktopUpdatePreferences) => {
    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
    const temporaryPath = `${resolvedPath}.${process.pid}.tmp`;
    try {
      fs.writeFileSync(temporaryPath, `${JSON.stringify(preferences, null, 2)}\n`, {
        encoding: 'utf8',
        mode: 0o600,
      });
      fs.renameSync(temporaryPath, resolvedPath);
    } finally {
      fs.rmSync(temporaryPath, { force: true });
    }
  };

  return { get, replace };
}
