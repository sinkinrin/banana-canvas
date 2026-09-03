import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopUpdateState } from '../src/lib/desktopUpdates';
import {
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
