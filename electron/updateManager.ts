import type {
  AppUpdater,
  ProgressInfo,
  UpdateInfo,
} from 'electron-updater';

export type DesktopUpdateInfo = Pick<
  UpdateInfo,
  'version' | 'releaseName' | 'releaseNotes'
>;

export type DesktopDownloadProgress = Pick<
  ProgressInfo,
  'percent' | 'transferred' | 'total' | 'bytesPerSecond'
>;

export type DesktopAutoUpdater = Pick<
  AppUpdater,
  | 'autoDownload'
  | 'autoInstallOnAppQuit'
  | 'allowPrerelease'
  | 'on'
  | 'removeListener'
  | 'checkForUpdates'
  | 'quitAndInstall'
>;

type UpdateLogLevel = 'info' | 'warn' | 'error';

type DesktopUpdateManagerOptions = {
  updater: DesktopAutoUpdater;
  logger: (level: UpdateLogLevel, message: string) => void;
  promptToRestart: (info: DesktopUpdateInfo) => Promise<boolean>;
  beforeInstall: () => Promise<void>;
  initialDelayMs?: number;
  checkIntervalMs?: number;
};

const DEFAULT_INITIAL_DELAY_MS = 10_000;
const DEFAULT_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function unrefTimer(timer: ReturnType<typeof setTimeout> | ReturnType<typeof setInterval>) {
  if (typeof timer === 'object' && 'unref' in timer) timer.unref();
}

export function createDesktopUpdateManager({
  updater,
  logger,
  promptToRestart,
  beforeInstall,
  initialDelayMs = DEFAULT_INITIAL_DELAY_MS,
  checkIntervalMs = DEFAULT_CHECK_INTERVAL_MS,
}: DesktopUpdateManagerOptions) {
  let started = false;
  let checkInFlight = false;
  let restartPromptPending = false;
  let lastProgressBucket = -1;
  let initialTimer: ReturnType<typeof setTimeout> | undefined;
  let intervalTimer: ReturnType<typeof setInterval> | undefined;

  const checkNow = async () => {
    if (checkInFlight) return;
    checkInFlight = true;
    try {
      await updater.checkForUpdates();
    } catch (error) {
      logger('error', `自动更新检查失败：${errorMessage(error)}`);
    } finally {
      checkInFlight = false;
    }
  };

  const handleError = (error: Error) => {
    logger('error', `自动更新错误：${errorMessage(error)}`);
  };
  const handleChecking = () => {
    logger('info', '正在检查更新。');
  };
  const handleAvailable = (info: DesktopUpdateInfo) => {
    logger('info', `发现新版本 ${info.version}，开始后台下载。`);
  };
  const handleNotAvailable = (info: DesktopUpdateInfo) => {
    logger('info', `当前已是最新版本 ${info.version}。`);
  };
  const handleProgress = (progress: DesktopDownloadProgress) => {
    const percent = Math.max(0, Math.min(100, progress.percent));
    const bucket = Math.floor(percent / 10) * 10;
    if (bucket === lastProgressBucket) return;
    lastProgressBucket = bucket;
    logger('info', `更新下载进度 ${bucket}%。`);
  };
  const handleDownloaded = (info: DesktopUpdateInfo) => {
    if (restartPromptPending) return;
    restartPromptPending = true;
    void (async () => {
      try {
        const shouldRestart = await promptToRestart(info);
        if (!shouldRestart) {
          logger('info', `版本 ${info.version} 将在应用退出后安装。`);
          return;
        }
        await beforeInstall();
        updater.quitAndInstall(false, true);
      } catch (error) {
        logger('error', `启动更新安装失败：${errorMessage(error)}`);
      } finally {
        restartPromptPending = false;
      }
    })();
  };

  const start = () => {
    if (started) return;
    started = true;
    updater.autoDownload = true;
    updater.autoInstallOnAppQuit = true;
    updater.allowPrerelease = false;

    updater.on('error', handleError);
    updater.on('checking-for-update', handleChecking);
    updater.on('update-available', handleAvailable);
    updater.on('update-not-available', handleNotAvailable);
    updater.on('download-progress', handleProgress);
    updater.on('update-downloaded', handleDownloaded);

    initialTimer = setTimeout(() => void checkNow(), initialDelayMs);
    intervalTimer = setInterval(() => void checkNow(), checkIntervalMs);
    unrefTimer(initialTimer);
    unrefTimer(intervalTimer);
  };

  const stop = () => {
    if (!started) return;
    started = false;
    if (initialTimer) clearTimeout(initialTimer);
    if (intervalTimer) clearInterval(intervalTimer);
    initialTimer = undefined;
    intervalTimer = undefined;

    updater.removeListener('error', handleError);
    updater.removeListener('checking-for-update', handleChecking);
    updater.removeListener('update-available', handleAvailable);
    updater.removeListener('update-not-available', handleNotAvailable);
    updater.removeListener('download-progress', handleProgress);
    updater.removeListener('update-downloaded', handleDownloaded);
  };

  return { start, stop, checkNow };
}
