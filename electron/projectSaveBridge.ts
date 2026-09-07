import type { IpcMain, IpcMainEvent, WebContents } from 'electron';
import { PROJECT_SAVES_READY_CHANNEL, PROJECT_SAVES_FLUSH_CHANNEL, PROJECT_SAVES_RESULT_CHANNEL } from './ipcChannels';

export function createProjectSaveBridge(ipc: IpcMain, contents: WebContents, timeoutMs = 30_000) {
  let ready = false;
  let nextId = 0;
  let pending: { id: number; promise: Promise<void>; finish: (ok: boolean) => void } | undefined;
  const isMainFrame = (event: IpcMainEvent) => event.sender === contents && event.senderFrame === contents.mainFrame;
  const onReady = (event: IpcMainEvent) => { if (isMainFrame(event)) ready = true; };
  const onResult = (event: IpcMainEvent, id: unknown, ok: unknown) => {
    if (isMainFrame(event) && pending && pending.id === id) pending.finish(ok === true);
  };
  const onNavigation = (_event: unknown, _url: string, inPlace: boolean, mainFrame: boolean) => {
    if (!inPlace && mainFrame) ready = false;
  };
  const dispose = () => {
    pending?.finish(false);
    ipc.removeListener(PROJECT_SAVES_READY_CHANNEL, onReady);
    ipc.removeListener(PROJECT_SAVES_RESULT_CHANNEL, onResult);
    contents.removeListener('did-start-navigation', onNavigation);
  };
  ipc.on(PROJECT_SAVES_READY_CHANNEL, onReady);
  ipc.on(PROJECT_SAVES_RESULT_CHANNEL, onResult);
  contents.on('did-start-navigation', onNavigation);
  contents.once('destroyed', dispose);

  return {
    flush(): Promise<void> {
      if (pending) return pending.promise;
      if (!ready || contents.isDestroyed()) return Promise.resolve();
      const id = ++nextId;
      let finish!: (ok: boolean) => void;
      const promise = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => finish(false), timeoutMs);
        finish = (ok) => {
          clearTimeout(timeout);
          pending = undefined;
          if (ok) resolve();
          else reject(new Error('Project changes could not be saved.'));
        };
      });
      pending = { id, promise, finish };
      contents.send(PROJECT_SAVES_FLUSH_CHANNEL, id);
      return promise;
    },
  };
}
