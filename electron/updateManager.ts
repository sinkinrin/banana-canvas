import type {
  AppUpdater,
  ProgressInfo,
  UpdateInfo,
} from 'electron-updater';

import type {
  DesktopUpdateProgress,
  DesktopUpdateState,
} from '../src/lib/desktopUpdates';

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
  | 'downloadUpdate'
  | 'quitAndInstall'
>;

type UpdateLogLevel = 'info' | 'warn' | 'error';
type UpdateActionSource = 'manual' | 'automatic';
type UpdateMessageKey = 'checkBeforeDownload' | 'updateNotDownloaded';

type DesktopUpdateManagerOptions = {
  updater: DesktopAutoUpdater;
  currentVersion: string;
  automaticUpdatesEnabled: boolean;
  logger: (level: UpdateLogLevel, message: string) => void;
  promptToRestart: (info: DesktopUpdateInfo) => Promise<boolean>;
  beforeInstall: () => Promise<void>;
  getMessage?: (key: UpdateMessageKey) => string;
  onStateChange?: (state: DesktopUpdateState) => void;
  initialDelayMs?: number;
  checkIntervalMs?: number;
};

const DEFAULT_INITIAL_DELAY_MS = 10_000;
const DEFAULT_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

function getNativeDefaultMessage(key: UpdateMessageKey) {
  return key === 'checkBeforeDownload'
    ? '请先检查更新，确认有可用的新版本。'
    : '更新尚未下载完成。';
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function unrefTimer(timer: ReturnType<typeof setTimeout> | ReturnType<typeof setInterval>) {
  if (typeof timer === 'object' && 'unref' in timer) timer.unref();
}

export function normalizeReleaseNotes(releaseNotes: DesktopUpdateInfo['releaseNotes']) {
  if (typeof releaseNotes === 'string') return releaseNotes.trim();
  if (!Array.isArray(releaseNotes)) return '';
  return releaseNotes
    .map((entry) => typeof entry === 'string' ? entry : entry.note)
    .filter((entry): entry is string => typeof entry === 'string' && Boolean(entry.trim()))
    .join('\n\n')
    .trim();
}

function cloneState(state: DesktopUpdateState): DesktopUpdateState {
  return {
    ...state,
    progress: state.progress ? { ...state.progress } : undefined,
  };
}

export function createDesktopUpdateManager({
  updater,
  currentVersion,
  automaticUpdatesEnabled,
  logger,
  promptToRestart,
  beforeInstall,
  getMessage = getNativeDefaultMessage,
  onStateChange,
  initialDelayMs = DEFAULT_INITIAL_DELAY_MS,
  checkIntervalMs = DEFAULT_CHECK_INTERVAL_MS,
}: DesktopUpdateManagerOptions) {
  let started = false;
  let state: DesktopUpdateState = {
    supported: true,
    currentVersion,
    automaticUpdatesEnabled,
    phase: 'idle',
    releaseNotes: '',
  };
  let availableInfo: DesktopUpdateInfo | undefined;
  let checkSource: UpdateActionSource = 'manual';
  let downloadSource: UpdateActionSource = 'manual';
  let checkPromise: Promise<void> | undefined;
  let downloadPromise: Promise<void> | undefined;
  let restartPromptPending = false;
  let lastProgressBucket = -1;
  let initialTimer: ReturnType<typeof setTimeout> | undefined;
  let intervalTimer: ReturnType<typeof setInterval> | undefined;

  const getState = () => cloneState(state);
  const patchState = (patch: Partial<DesktopUpdateState>) => {
    state = { ...state, ...patch };
    onStateChange?.(getState());
  };
  const clearAutomaticTimers = () => {
    if (initialTimer) clearTimeout(initialTimer);
    if (intervalTimer) clearInterval(intervalTimer);
    initialTimer = undefined;
    intervalTimer = undefined;
  };

  const checkNow = async (source: UpdateActionSource = 'manual') => {
    if (checkPromise) {
      await checkPromise;
      return getState();
    }
    checkSource = source;
    patchState({ phase: 'checking', error: undefined, progress: undefined });
    checkPromise = (async () => {
      try {
        await updater.checkForUpdates();
      } catch (error) {
        const message = errorMessage(error);
        logger('error', `更新检查失败：${message}`);
        patchState({ phase: 'error', error: message, lastCheckedAt: new Date().toISOString() });
      } finally {
        checkPromise = undefined;
      }
    })();
    await checkPromise;
    return getState();
  };

  const download = async (source: UpdateActionSource = 'manual') => {
    if (downloadPromise) {
      await downloadPromise;
      return getState();
    }
    if (!availableInfo) {
      patchState({ phase: 'error', error: getMessage('checkBeforeDownload') });
      return getState();
    }

    downloadSource = source;
    updater.autoInstallOnAppQuit = source === 'automatic';
    lastProgressBucket = -1;
    patchState({
      phase: 'downloading',
      error: undefined,
      progress: { percent: 0, transferred: 0, total: 0, bytesPerSecond: 0 },
    });
    downloadPromise = (async () => {
      try {
        await updater.downloadUpdate();
      } catch (error) {
        const message = errorMessage(error);
        logger('error', `更新下载失败：${message}`);
        patchState({ phase: 'error', error: message });
      } finally {
        downloadPromise = undefined;
      }
    })();
    await downloadPromise;
    return getState();
  };

  const scheduleAutomaticChecks = () => {
    clearAutomaticTimers();
    if (!started || !state.automaticUpdatesEnabled) return;
    initialTimer = setTimeout(() => void checkNow('automatic'), initialDelayMs);
    intervalTimer = setInterval(() => void checkNow('automatic'), checkIntervalMs);
    unrefTimer(initialTimer);
    unrefTimer(intervalTimer);
  };

  const handleError = (error: Error) => {
    const message = errorMessage(error);
    logger('error', `自动更新错误：${message}`);
    patchState({ phase: 'error', error: message });
  };
  const handleChecking = () => {
    logger('info', '正在检查更新。');
    if (state.phase !== 'checking') patchState({ phase: 'checking', error: undefined });
  };
  const handleAvailable = (info: DesktopUpdateInfo) => {
    availableInfo = info;
    patchState({
      phase: 'available',
      latestVersion: info.version,
      releaseName: info.releaseName?.trim() || undefined,
      releaseNotes: normalizeReleaseNotes(info.releaseNotes),
      error: undefined,
      lastCheckedAt: new Date().toISOString(),
    });
    logger('info', `发现新版本 ${info.version}。`);
    if (checkSource === 'automatic' && state.automaticUpdatesEnabled) {
      logger('info', `开始后台下载版本 ${info.version}。`);
      void download('automatic');
    }
  };
  const handleNotAvailable = (info: DesktopUpdateInfo) => {
    availableInfo = undefined;
    patchState({
      phase: 'up-to-date',
      latestVersion: info.version,
      releaseName: info.releaseName?.trim() || undefined,
      releaseNotes: normalizeReleaseNotes(info.releaseNotes),
      progress: undefined,
      error: undefined,
      lastCheckedAt: new Date().toISOString(),
    });
    logger('info', `当前已是最新版本 ${info.version}。`);
  };
  const handleProgress = (progress: DesktopDownloadProgress) => {
    const normalizedProgress: DesktopUpdateProgress = {
      percent: Math.max(0, Math.min(100, progress.percent)),
      transferred: Math.max(0, progress.transferred),
      total: Math.max(0, progress.total),
      bytesPerSecond: Math.max(0, progress.bytesPerSecond),
    };
    patchState({ phase: 'downloading', progress: normalizedProgress, error: undefined });
    const bucket = Math.floor(normalizedProgress.percent / 10) * 10;
    if (bucket === lastProgressBucket) return;
    lastProgressBucket = bucket;
    logger('info', `更新下载进度 ${bucket}%。`);
  };
  const handleDownloaded = (info: DesktopUpdateInfo) => {
    const mergedInfo: DesktopUpdateInfo = {
      ...info,
      releaseName: info.releaseName ?? availableInfo?.releaseName,
      releaseNotes: info.releaseNotes ?? availableInfo?.releaseNotes,
    };
    availableInfo = mergedInfo;
    patchState({
      phase: 'downloaded',
      latestVersion: mergedInfo.version,
      releaseName: mergedInfo.releaseName?.trim() || undefined,
      releaseNotes: normalizeReleaseNotes(mergedInfo.releaseNotes),
      progress: {
        percent: 100,
        transferred: state.progress?.total ?? state.progress?.transferred ?? 0,
        total: state.progress?.total ?? 0,
        bytesPerSecond: 0,
      },
      error: undefined,
    });
    logger('info', `版本 ${mergedInfo.version} 下载完成。`);

    if (downloadSource !== 'automatic' || !state.automaticUpdatesEnabled || restartPromptPending) return;
    restartPromptPending = true;
    void (async () => {
      try {
        const shouldRestart = await promptToRestart(mergedInfo);
        if (!shouldRestart) {
          logger('info', `版本 ${mergedInfo.version} 将在应用退出后安装。`);
          return;
        }
        await beforeInstall();
        updater.quitAndInstall(false, true);
      } catch (error) {
        const message = errorMessage(error);
        logger('error', `启动更新安装失败：${message}`);
        patchState({ phase: 'error', error: message });
      } finally {
        restartPromptPending = false;
      }
    })();
  };

  const start = () => {
    if (started) return;
    started = true;
    updater.autoDownload = false;
    updater.autoInstallOnAppQuit = false;
    updater.allowPrerelease = false;

    updater.on('error', handleError);
    updater.on('checking-for-update', handleChecking);
    updater.on('update-available', handleAvailable);
    updater.on('update-not-available', handleNotAvailable);
    updater.on('download-progress', handleProgress);
    updater.on('update-downloaded', handleDownloaded);
    scheduleAutomaticChecks();
  };

  const stop = () => {
    if (!started) return;
    started = false;
    clearAutomaticTimers();
    updater.removeListener('error', handleError);
    updater.removeListener('checking-for-update', handleChecking);
    updater.removeListener('update-available', handleAvailable);
    updater.removeListener('update-not-available', handleNotAvailable);
    updater.removeListener('download-progress', handleProgress);
    updater.removeListener('update-downloaded', handleDownloaded);
  };

  const setAutomaticUpdatesEnabled = (enabled: boolean) => {
    patchState({ automaticUpdatesEnabled: enabled });
    if (!enabled) updater.autoInstallOnAppQuit = false;
    scheduleAutomaticChecks();
    return getState();
  };

  const installNow = async () => {
    if (state.phase !== 'downloaded') {
      patchState({ phase: 'error', error: getMessage('updateNotDownloaded') });
      return getState();
    }
    try {
      await beforeInstall();
      updater.quitAndInstall(false, true);
    } catch (error) {
      const message = errorMessage(error);
      logger('error', `启动更新安装失败：${message}`);
      patchState({ phase: 'error', error: message });
    }
    return getState();
  };

  return {
    start,
    stop,
    getState,
    checkNow: () => checkNow('manual'),
    downloadUpdate: () => download('manual'),
    installNow,
    setAutomaticUpdatesEnabled,
  };
}
