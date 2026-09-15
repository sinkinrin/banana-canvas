import fs from 'node:fs';
import path from 'node:path';

export type DesktopUpdatePreferences = {
  automaticUpdatesEnabled: boolean;
  checkOnStartupEnabled: boolean;
};

const DEFAULT_PREFERENCES: DesktopUpdatePreferences = {
  automaticUpdatesEnabled: false,
  checkOnStartupEnabled: true,
};

export function createUpdatePreferencesStore(filePath: string) {
  const resolvedPath = path.resolve(filePath);

  const get = (): DesktopUpdatePreferences => {
    try {
      const parsed = JSON.parse(fs.readFileSync(resolvedPath, 'utf8')) as {
        automaticUpdatesEnabled?: unknown;
        checkOnStartupEnabled?: unknown;
      };
      return {
        automaticUpdatesEnabled: parsed.automaticUpdatesEnabled === true,
        checkOnStartupEnabled: parsed.checkOnStartupEnabled !== false,
      };
    } catch {
      return { ...DEFAULT_PREFERENCES };
    }
  };

  const replace = (preferences: Partial<DesktopUpdatePreferences>) => {
    const next = { ...get(), ...preferences };
    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
    const temporaryPath = `${resolvedPath}.${process.pid}.tmp`;
    try {
      fs.writeFileSync(temporaryPath, `${JSON.stringify(next, null, 2)}\n`, {
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
