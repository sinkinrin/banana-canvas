export type DesktopUpdatePhase =
  | 'idle'
  | 'checking'
  | 'up-to-date'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'error';

export type DesktopUpdateProgress = {
  percent: number;
  transferred: number;
  total: number;
  bytesPerSecond: number;
};

export type DesktopUpdateState = {
  supported: boolean;
  currentVersion: string;
  automaticUpdatesEnabled: boolean;
  phase: DesktopUpdatePhase;
  latestVersion?: string;
  releaseName?: string;
  releaseNotes: string;
  progress?: DesktopUpdateProgress;
  error?: string;
  lastCheckedAt?: string;
};

export type DesktopUpdateBridge = {
  getState: () => Promise<DesktopUpdateState>;
  checkForUpdates: () => Promise<DesktopUpdateState>;
  downloadUpdate: () => Promise<DesktopUpdateState>;
  installUpdate: () => Promise<DesktopUpdateState>;
  setAutomaticUpdatesEnabled: (enabled: boolean) => Promise<DesktopUpdateState>;
  subscribe: (listener: (state: DesktopUpdateState) => void) => string;
  unsubscribe: (subscriptionId: string) => void;
};

type BananaDesktopBridge = {
  updates?: DesktopUpdateBridge;
};

export function getDesktopUpdateBridge() {
  return (globalThis as typeof globalThis & { bananaDesktop?: BananaDesktopBridge })
    .bananaDesktop?.updates;
}

export function createUnavailableUpdateState(currentVersion: string): DesktopUpdateState {
  return {
    supported: false,
    currentVersion,
    automaticUpdatesEnabled: false,
    phase: 'idle',
    releaseNotes: '',
  };
}
