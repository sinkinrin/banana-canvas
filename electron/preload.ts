import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopUpdateState } from '../src/lib/desktopUpdates';
import type { CutoutModelId, CutoutRequest, CutoutState } from '../src/lib/cutoutModels';
import {
  PROJECT_SAVES_READY_CHANNEL,
  PROJECT_SAVES_FLUSH_CHANNEL,
  PROJECT_SAVES_RESULT_CHANNEL,
  UPDATE_CHECK_CHANNEL,
  UPDATE_DOWNLOAD_CHANNEL,
  UPDATE_GET_STATE_CHANNEL,
  UPDATE_INSTALL_CHANNEL,
  UPDATE_SET_AUTOMATIC_CHANNEL,
  UPDATE_STATE_CHANGED_CHANNEL,
  SET_APP_LANGUAGE_CHANNEL,
  WRITE_IMAGE_TO_CLIPBOARD_CHANNEL,
} from './ipcChannels';

const updateSubscriptions = new Map<string, (_event: Electron.IpcRendererEvent, state: DesktopUpdateState) => void>();
let nextUpdateSubscriptionId = 0;

contextBridge.exposeInMainWorld('bananaDesktop', Object.freeze({
  cutout: Object.freeze({
    getState: () => ipcRenderer.invoke('banana:cutout:state'),
    select: (id: CutoutModelId) => ipcRenderer.invoke('banana:cutout:select', id),
    download: (id: CutoutModelId) => ipcRenderer.invoke('banana:cutout:download', id),
    cancelDownload: () => ipcRenderer.invoke('banana:cutout:cancel-download'),
    remove: (id: CutoutModelId) => ipcRenderer.invoke('banana:cutout:remove', id),
    run: (request: CutoutRequest) => ipcRenderer.invoke('banana:cutout:run', request),
    cancel: (requestId: string) => ipcRenderer.invoke('banana:cutout:cancel', requestId),
    subscribe: (listener: (state: CutoutState) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, state: CutoutState) => listener(state);
      ipcRenderer.on('banana:cutout:changed', handler);
      return () => ipcRenderer.removeListener('banana:cutout:changed', handler);
    },
  }),
  onFlushProjectSaves: (handler: () => Promise<void>) => {
    const listener = (_event: Electron.IpcRendererEvent, requestId: number) => {
      void Promise.resolve().then(handler).then(
        () => ipcRenderer.send(PROJECT_SAVES_RESULT_CHANNEL, requestId, true),
        () => ipcRenderer.send(PROJECT_SAVES_RESULT_CHANNEL, requestId, false),
      );
    };
    ipcRenderer.on(PROJECT_SAVES_FLUSH_CHANNEL, listener);
    ipcRenderer.send(PROJECT_SAVES_READY_CHANNEL);
    return () => ipcRenderer.removeListener(PROJECT_SAVES_FLUSH_CHANNEL, listener);
  },
  setLanguage: async (language: string) => {
    await ipcRenderer.invoke(SET_APP_LANGUAGE_CHANNEL, language);
  },
  copyImageToClipboard: async (imageDataUrl: string) => {
    await ipcRenderer.invoke(WRITE_IMAGE_TO_CLIPBOARD_CHANNEL, imageDataUrl);
  },
  updates: Object.freeze({
    getState: async () => await ipcRenderer.invoke(UPDATE_GET_STATE_CHANNEL),
    checkForUpdates: async () => await ipcRenderer.invoke(UPDATE_CHECK_CHANNEL),
    downloadUpdate: async () => await ipcRenderer.invoke(UPDATE_DOWNLOAD_CHANNEL),
    installUpdate: async () => await ipcRenderer.invoke(UPDATE_INSTALL_CHANNEL),
    setAutomaticUpdatesEnabled: async (enabled: boolean) =>
      await ipcRenderer.invoke(UPDATE_SET_AUTOMATIC_CHANNEL, enabled),
    subscribe: (listener: (state: DesktopUpdateState) => void) => {
      const subscriptionId = String(++nextUpdateSubscriptionId);
      const ipcListener = (_event: Electron.IpcRendererEvent, state: DesktopUpdateState) => listener(state);
      updateSubscriptions.set(subscriptionId, ipcListener);
      ipcRenderer.on(UPDATE_STATE_CHANGED_CHANNEL, ipcListener);
      return subscriptionId;
    },
    unsubscribe: (subscriptionId: string) => {
      const listener = updateSubscriptions.get(subscriptionId);
      if (!listener) return;
      ipcRenderer.removeListener(UPDATE_STATE_CHANGED_CHANNEL, listener);
      updateSubscriptions.delete(subscriptionId);
    },
  }),
}));
