import path from 'node:path';
import { app, dialog, ipcMain, shell, type BrowserWindow } from 'electron';
import { appLog, installConsoleLogging, printLog, setAppLogSink } from '../src/server/appLog';
import type { LogQuery } from '../src/lib/diagnostics';
import { LogStore } from './logStore';

export function initializeDiagnostics(getWindow: () => BrowserWindow | null) {
  const store = new LogStore(path.join(app.getPath('userData'), 'logs'));
  setAppLogSink((entry) => {
    store.write(entry);
    if ((!app.isPackaged || process.env.BANANA_SMOKE_TEST === '1') && (entry.level !== 'debug' || store.state().mode === 'debug')) printLog(entry);
  });
  installConsoleLogging();
  if (process.argv.includes('--debug')) {
    try { store.setMode('debug'); } catch (error) { appLog('warn', 'settings', 'Unable to persist Debug mode', error); }
  }
  const environment = () => ({ appVersion: app.getVersion(), electron: process.versions.electron,
    chromium: process.versions.chrome, node: process.versions.node, platform: process.platform, arch: process.arch,
    packaged: app.isPackaged, ...store.state() });
  appLog('info', 'startup', 'Application starting', environment());
  // Monitoring preserves Node's default fatal-exception behavior.
  process.on('uncaughtExceptionMonitor', (error) => appLog('error', 'main', 'Uncaught exception', error));
  process.on('unhandledRejection', (reason) => appLog('error', 'main', 'Unhandled rejection', reason));
  app.on('child-process-gone', (_event, details) => appLog('error', 'main', 'Child process exited', details));
  app.on('quit', (_event, code) => appLog('info', 'shutdown', 'Application exiting', { code }));
  function assertSender(event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent) {
    if (event.sender !== getWindow()?.webContents || event.senderFrame !== event.sender.mainFrame) throw new Error('Invalid diagnostics sender');
  }
  const handle = (name: string, callback: (value: any) => unknown) => ipcMain.handle(`banana:logs:${name}`, (event, value) => {
    assertSender(event); return callback(value);
  });
  handle('state', () => store.state());
  handle('mode', (mode) => store.setMode(mode));
  let queryQueue: Promise<unknown> = Promise.resolve();
  handle('query', async (input) => {
    const query: LogQuery = {};
    if (input && typeof input === 'object') {
      for (const key of ['session', 'level', 'module', 'search', 'before'] as const) {
        if (typeof input[key] === 'string') (query as Record<string, string>)[key] = input[key].slice(0, 256);
      }
    }
    const result = queryQueue.then(() => store.query(query));
    queryQueue = result.catch(() => undefined);
    return result;
  });
  handle('folder', async () => { const error = await shell.openPath(store.directory); if (error) throw new Error(error); });
  handle('export', async () => {
    const window = getWindow();
    if (!window) return false;
    const result = await dialog.showSaveDialog(window, { defaultPath: `banana-diagnostics-${new Date().toISOString().slice(0, 10)}.log`,
      filters: [{ name: 'Log', extensions: ['log'] }] });
    if (result.canceled || !result.filePath) return false;
    const relative = path.relative(store.directory, result.filePath);
    if (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative)) throw new Error('Choose a destination outside the logs directory');
    await store.exportTo(result.filePath, environment());
    return true;
  });
  let reports = 0;
  const reset = setInterval(() => { reports = 0; }, 1000); reset.unref();
  ipcMain.on('banana:logs:report', (event, input) => {
    try { assertSender(event); } catch { return; }
    if (++reports > 20 || !input || !['warn', 'error'].includes(input.level) || typeof input.message !== 'string') return;
    appLog(input.level, 'renderer', input.message.slice(0, 8000), input.details);
  });
  return store;
}
