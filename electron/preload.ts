import { contextBridge, ipcRenderer } from 'electron';
import { WRITE_IMAGE_TO_CLIPBOARD_CHANNEL } from './ipcChannels';

contextBridge.exposeInMainWorld('bananaDesktop', Object.freeze({
  copyImageToClipboard: async (imageDataUrl: string) => {
    await ipcRenderer.invoke(WRITE_IMAGE_TO_CLIPBOARD_CHANNEL, imageDataUrl);
  },
}));
