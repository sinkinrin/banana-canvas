import type { BrowserWindow, IpcMain, IpcMainInvokeEvent } from 'electron';
import {
  WINDOW_STATE_CHANNEL, WINDOW_MINIMIZE_CHANNEL, WINDOW_MAXIMIZE_CHANNEL,
  WINDOW_CLOSE_CHANNEL, WINDOW_STATE_CHANGED_CHANNEL,
} from './ipcChannels';

export function registerWindowControls(ipc: IpcMain, getWindow: () => BrowserWindow | null) {
  const authorizedWindow = (event: IpcMainInvokeEvent) => {
    const window = getWindow();
    if (!window || window.isDestroyed() || event.sender !== window.webContents
      || event.senderFrame !== window.webContents.mainFrame) {
      throw new Error('Window control request did not come from the application main frame');
    }
    return window;
  };
  ipc.handle(WINDOW_STATE_CHANNEL, event => ({ maximized: authorizedWindow(event).isMaximized() }));
  ipc.handle(WINDOW_MINIMIZE_CHANNEL, event => { authorizedWindow(event).minimize(); });
  ipc.handle(WINDOW_MAXIMIZE_CHANNEL, event => {
    const window = authorizedWindow(event);
    if (window.isMaximized()) window.unmaximize();
    else window.maximize();
  });
  // close(), not destroy()/exit(): project saving and beforeunload must still run.
  ipc.handle(WINDOW_CLOSE_CHANNEL, event => { authorizedWindow(event).close(); });
}

export function observeWindowState(window: BrowserWindow) {
  const send = () => {
    if (!window.webContents.isDestroyed()) {
      window.webContents.send(WINDOW_STATE_CHANGED_CHANNEL, { maximized: window.isMaximized() });
    }
  };
  window.on('maximize', send);
  window.on('unmaximize', send);
}
