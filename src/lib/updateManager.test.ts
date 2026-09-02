import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';

import {
  createDesktopUpdateManager,
  type DesktopAutoUpdater,
  type DesktopUpdateInfo,
} from '../../electron/updateManager';

class FakeUpdater extends EventEmitter {
  autoDownload = false;
  autoInstallOnAppQuit = false;
  allowPrerelease = true;
  checkCount = 0;
  checkError?: Error;
  quitArguments?: [boolean | undefined, boolean | undefined];

  async checkForUpdates() {
    this.checkCount += 1;
    if (this.checkError) throw this.checkError;
    return undefined;
  }

  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean) {
    this.quitArguments = [isSilent, isForceRunAfter];
  }
}

function asUpdater(updater: FakeUpdater) {
  return updater as unknown as DesktopAutoUpdater;
}

function nextTurn() {
  return new Promise<void>((resolve) => setImmediate(resolve));
}

test('desktop updater downloads stable releases and checks without overlapping', async () => {
  const updater = new FakeUpdater();
  const manager = createDesktopUpdateManager({
    updater: asUpdater(updater),
    logger: () => {},
    promptToRestart: async () => false,
    beforeInstall: async () => {},
    initialDelayMs: 60_000,
    checkIntervalMs: 60_000,
  });

  manager.start();
  assert.equal(updater.autoDownload, true);
  assert.equal(updater.autoInstallOnAppQuit, true);
  assert.equal(updater.allowPrerelease, false);

  await Promise.all([manager.checkNow(), manager.checkNow()]);
  assert.equal(updater.checkCount, 1);
  manager.stop();
});

test('downloaded update asks before restarting and installs after cleanup', async () => {
  const updater = new FakeUpdater();
  const calls: string[] = [];
  const manager = createDesktopUpdateManager({
    updater: asUpdater(updater),
    logger: () => {},
    promptToRestart: async (info: DesktopUpdateInfo) => {
      calls.push(`prompt:${info.version}`);
      return true;
    },
    beforeInstall: async () => {
      calls.push('cleanup');
    },
    initialDelayMs: 60_000,
    checkIntervalMs: 60_000,
  });

  manager.start();
  updater.emit('update-downloaded', { version: '0.3.1' });
  await nextTurn();

  assert.deepEqual(calls, ['prompt:0.3.1', 'cleanup']);
  assert.deepEqual(updater.quitArguments, [false, true]);
  manager.stop();
});

test('declining restart leaves the downloaded update for application exit', async () => {
  const updater = new FakeUpdater();
  let cleanupCalled = false;
  const manager = createDesktopUpdateManager({
    updater: asUpdater(updater),
    logger: () => {},
    promptToRestart: async () => false,
    beforeInstall: async () => {
      cleanupCalled = true;
    },
    initialDelayMs: 60_000,
    checkIntervalMs: 60_000,
  });

  manager.start();
  updater.emit('update-downloaded', { version: '0.3.1' });
  await nextTurn();

  assert.equal(cleanupCalled, false);
  assert.equal(updater.quitArguments, undefined);
  manager.stop();
});

test('update check errors are contained and logged', async () => {
  const updater = new FakeUpdater();
  updater.checkError = new Error('network unavailable');
  const messages: string[] = [];
  const manager = createDesktopUpdateManager({
    updater: asUpdater(updater),
    logger: (level, message) => messages.push(`${level}:${message}`),
    promptToRestart: async () => false,
    beforeInstall: async () => {},
    initialDelayMs: 60_000,
    checkIntervalMs: 60_000,
  });

  await manager.checkNow();

  assert.deepEqual(messages, ['error:自动更新检查失败：network unavailable']);
});
