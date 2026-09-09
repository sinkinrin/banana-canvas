import path from 'node:path';
import { app, ipcMain, net, utilityProcess, type BrowserWindow, type UtilityProcess } from 'electron';
import { CUTOUT_INPUT_SIZE, getCutoutModel, type CutoutRequest } from '../src/lib/cutoutModels';
import { CutoutModelStore } from './cutoutModelStore';

export function registerCutoutIpc(getWindow: () => BrowserWindow | null, getRoot: () => string) {
  let store: CutoutModelStore | undefined;
  let active: { requestId: string; worker?: UtilityProcess; cancel: () => void } | undefined;
  function getStore() {
    store ??= new CutoutModelStore(
      path.join(app.getPath('userData'), 'cutout-models'),
      app.isPackaged ? path.join(process.resourcesPath, 'cutout', 'isnet-int8.onnx') : path.join(getRoot(), 'assets', 'models', 'isnet-int8.onnx'),
      (url, init) => net.fetch(url.toString(), init),
      () => { void emit(); },
    );
    return store;
  }
  async function state() { return { ...await getStore().getState(), busy: Boolean(active) }; }
  async function emit() {
    try {
      const value = await state();
      const window = getWindow();
      if (window && !window.isDestroyed()) window.webContents.send('banana:cutout:changed', value);
    } catch { console.error('[banana:cutout] could not read model state'); }
  }
  function handle(name: string, callback: (...args: any[]) => unknown) {
    ipcMain.handle(`banana:cutout:${name}`, (event, ...args) => {
      if (event.sender !== getWindow()?.webContents) throw new Error('INVALID_SENDER');
      return callback(...args);
    });
  }
  handle('state', state);
  handle('select', async (id: unknown) => { await getStore().select(id); return state(); });
  handle('download', async (id: unknown) => { await getStore().download(id); return state(); });
  handle('cancel-download', () => getStore().cancelDownload());
  handle('remove', async (id: unknown) => {
    if (active) throw new Error('BUSY');
    await getStore().remove(id);
    return state();
  });
  handle('cancel', (id: unknown) => { if (active && active.requestId === id) active.cancel(); });
  handle('run', async (request: CutoutRequest) => {
    if (active) throw new Error('BUSY');
    if (!request || typeof request.requestId !== 'string' || request.requestId.length > 80 || !(request.input instanceof Float32Array) || request.input.length !== 3 * CUTOUT_INPUT_SIZE ** 2) throw new Error('INVALID_IMAGE');
    getCutoutModel(request.modelId);
    return new Promise<Uint8Array>((resolve, reject) => {
      let settled = false;
      const finish = (error?: string, alpha?: Uint8Array) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        active?.worker?.kill();
        active = undefined;
        void emit();
        if (error) reject(new Error(error)); else resolve(alpha!);
      };
      const timeout = setTimeout(() => finish('INFERENCE_TIMEOUT'), 180_000);
      active = { requestId: request.requestId, cancel: () => finish('CANCELLED') };
      void emit();
      void getStore().verifiedPath(request.modelId).then((modelPath) => {
        if (settled) return;
        const worker = utilityProcess.fork(path.join(__dirname, 'cutoutWorker.cjs'), [], { serviceName: 'Banana Cutout', stdio: 'pipe' });
        active!.worker = worker;
        worker.stderr?.on('data', (chunk: Buffer) => console.error('[banana:cutout-worker]', chunk.toString().trim()));
        worker.once('spawn', () => worker.postMessage({ ...request, modelPath }));
        worker.once('message', (message: { error?: string; alpha?: Uint8Array }) => {
          if (message.error) finish(message.error);
          else if (!(message.alpha instanceof Uint8Array) || message.alpha.length !== CUTOUT_INPUT_SIZE ** 2) finish('INVALID_MASK');
          else finish(undefined, message.alpha);
        });
        worker.once('exit', () => finish('INFERENCE_FAILED'));
      }).catch((error) => finish(error instanceof Error ? error.message : 'INFERENCE_FAILED'));
    });
  });
  app.on('before-quit', () => { active?.cancel(); store?.cancelDownload(); });
}
