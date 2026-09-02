import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';

import {
  createDesktopUpdateManager,
  normalizeReleaseNotes,
  type DesktopAutoUpdater,
  type DesktopUpdateInfo,
} from '../../electron/updateManager';
import type { DesktopUpdateState } from './desktopUpdates';

class FakeUpdater extends EventEmitter {
  autoDownload = true;
  autoInstallOnAppQuit = true;
  allowPrerelease = true;
  checkCount = 0;
  downloadCount = 0;
  checkError?: Error;
  downloadError?: Error;
  checkGate?: Promise<void>;
  quitArguments?: [boolean | undefined, boolean | undefined];

  async checkForUpdates() {
    this.checkCount += 1;
    if (this.checkGate) await this.checkGate;
    if (this.checkError) throw this.checkError;
    return undefined;
  }

  async downloadUpdate() {
    this.downloadCount += 1;
    if (this.downloadError) throw this.downloadError;
    return [];
  }

  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean) {
    this.quitArguments = [isSilent, isForceRunAfter];
  }
}

function asUpdater(updater: FakeUpdater) {
  return updater as unknown as DesktopAutoUpdater;
}

function createManager(
  updater: FakeUpdater,
  overrides: Partial<Parameters<typeof createDesktopUpdateManager>[0]> = {}
) {
  return createDesktopUpdateManager({
    updater: asUpdater(updater),
    currentVersion: '0.4.0',
    automaticUpdatesEnabled: false,
    logger: () => {},
    promptToRestart: async () => false,
    beforeInstall: async () => {},
    initialDelayMs: 60_000,
    checkIntervalMs: 60_000,
    ...overrides,
  });
}

function nextTurn() {
  return new Promise<void>((resolve) => setImmediate(resolve));
}

test('desktop updates start in explicit manual mode by default', () => {
  const updater = new FakeUpdater();
  const manager = createManager(updater);

  manager.start();
  assert.equal(updater.autoDownload, false);
  assert.equal(updater.autoInstallOnAppQuit, false);
  assert.equal(updater.allowPrerelease, false);
  assert.equal(manager.getState().automaticUpdatesEnabled, false);
  assert.equal(updater.checkCount, 0);
  manager.stop();
});

test('manual checks expose latest version and release notes without downloading', async () => {
  const updater = new FakeUpdater();
  const states: DesktopUpdateState[] = [];
  const manager = createManager(updater, { onStateChange: (state) => states.push(state) });
  const info: DesktopUpdateInfo = {
    version: '0.5.0',
    releaseName: 'Banana Canvas v0.5.0',
    releaseNotes: '### 新增\n\n- 提示词管理',
  };

  manager.start();
  const checking = manager.checkNow();
  updater.emit('update-available', info);
  await checking;

  assert.equal(updater.checkCount, 1);
  assert.equal(updater.downloadCount, 0);
  assert.equal(manager.getState().phase, 'available');
  assert.equal(manager.getState().latestVersion, '0.5.0');
  assert.match(manager.getState().releaseNotes, /提示词管理/);
  assert.ok(states.some((state) => state.phase === 'checking'));
  manager.stop();
});

test('overlapping manual checks share one updater request', async () => {
  const updater = new FakeUpdater();
  let release!: () => void;
  updater.checkGate = new Promise<void>((resolve) => { release = resolve; });
  const manager = createManager(updater);
  manager.start();

  const first = manager.checkNow();
  const second = manager.checkNow();
  release();
  await Promise.all([first, second]);

  assert.equal(updater.checkCount, 1);
  manager.stop();
});

test('manual download reports progress and waits for an explicit install action', async () => {
  const updater = new FakeUpdater();
  let prompted = false;
  const manager = createManager(updater, {
    promptToRestart: async () => {
      prompted = true;
      return true;
    },
  });
  const info: DesktopUpdateInfo = { version: '0.5.0', releaseNotes: 'notes' };
  manager.start();
  updater.emit('update-available', info);

  const download = manager.downloadUpdate();
  updater.emit('download-progress', {
    percent: 42.5,
    transferred: 425,
    total: 1_000,
    bytesPerSecond: 100,
  });
  updater.emit('update-downloaded', info);
  await download;
  await nextTurn();

  assert.equal(updater.downloadCount, 1);
  assert.equal(manager.getState().phase, 'downloaded');
  assert.equal(manager.getState().progress?.percent, 100);
  assert.equal(prompted, false);
  assert.equal(updater.autoInstallOnAppQuit, false);

  await manager.installNow();
  assert.deepEqual(updater.quitArguments, [false, true]);
  manager.stop();
});

test('download completion keeps release notes from the availability event', async () => {
  const updater = new FakeUpdater();
  const manager = createManager(updater);
  manager.start();
  updater.emit('update-available', {
    version: '0.5.0',
    releaseName: 'Banana Canvas v0.5.0',
    releaseNotes: 'new features',
  } satisfies DesktopUpdateInfo);

  const download = manager.downloadUpdate();
  updater.emit('update-downloaded', { version: '0.5.0' });
  await download;

  assert.equal(manager.getState().releaseName, 'Banana Canvas v0.5.0');
  assert.equal(manager.getState().releaseNotes, 'new features');
  manager.stop();
});

test('automatic opt-in checks, downloads, and asks before restart', async () => {
  const updater = new FakeUpdater();
  const calls: string[] = [];
  const info: DesktopUpdateInfo = { version: '0.5.0', releaseNotes: 'notes' };
  updater.checkForUpdates = async () => {
    updater.checkCount += 1;
    updater.emit('checking-for-update');
    updater.emit('update-available', info);
    return undefined;
  };
  updater.downloadUpdate = async () => {
    updater.downloadCount += 1;
    updater.emit('update-downloaded', info);
    return [];
  };
  const manager = createManager(updater, {
    automaticUpdatesEnabled: true,
    initialDelayMs: 1,
    promptToRestart: async () => {
      calls.push('prompt');
      return true;
    },
    beforeInstall: async () => { calls.push('cleanup'); },
  });

  manager.start();
  await new Promise((resolve) => setTimeout(resolve, 20));
  await nextTurn();

  assert.equal(updater.checkCount, 1);
  assert.equal(updater.downloadCount, 1);
  assert.deepEqual(calls, ['prompt', 'cleanup']);
  assert.equal(updater.autoInstallOnAppQuit, true);
  assert.deepEqual(updater.quitArguments, [false, true]);
  manager.stop();
});

test('update check errors are visible and contained', async () => {
  const updater = new FakeUpdater();
  updater.checkError = new Error('network unavailable');
  const messages: string[] = [];
  const manager = createManager(updater, {
    logger: (level, message) => messages.push(`${level}:${message}`),
  });

  await manager.checkNow();

  assert.equal(manager.getState().phase, 'error');
  assert.equal(manager.getState().error, 'network unavailable');
  assert.deepEqual(messages, ['error:更新检查失败：network unavailable']);
});

test('release notes normalize electron updater arrays for renderer display', () => {
  assert.equal(
    normalizeReleaseNotes([
      { version: '0.5.0', note: 'first' },
      { version: '0.4.1', note: 'second' },
    ]),
    'first\n\nsecond'
  );
});
