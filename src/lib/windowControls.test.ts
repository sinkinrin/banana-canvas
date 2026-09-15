import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import type { BrowserWindow, IpcMain, IpcMainInvokeEvent } from 'electron';
import { registerWindowControls, observeWindowState } from '../../electron/windowControls';
import { WINDOW_CLOSE_CHANNEL, WINDOW_MAXIMIZE_CHANNEL, WINDOW_MINIMIZE_CHANNEL, WINDOW_STATE_CHANNEL, WINDOW_STATE_CHANGED_CHANNEL } from '../../electron/ipcChannels';

function fixture() {
  const handlers = new Map<string, (event: IpcMainInvokeEvent) => unknown>();
  const calls: string[] = [];
  let maximized = false;
  let destroyed = false;
  const contents = { mainFrame: {}, isDestroyed: () => destroyed, send: (channel: string, state: unknown) => messages.push({ channel, state }) };
  const messages: { channel: string; state: unknown }[] = [];
  const window = Object.assign(new EventEmitter(), {
    webContents: contents, isDestroyed: () => destroyed, isMaximized: () => maximized,
    minimize: () => calls.push('minimize'), close: () => calls.push('close'),
    maximize: () => { maximized = true; window.emit('maximize'); },
    unmaximize: () => { maximized = false; window.emit('unmaximize'); },
  });
  registerWindowControls({ handle: (channel: string, handler: (event: IpcMainInvokeEvent) => unknown) => handlers.set(channel, handler) } as unknown as IpcMain, () => window as unknown as BrowserWindow);
  observeWindowState(window as unknown as BrowserWindow);
  const event = { sender: contents, senderFrame: contents.mainFrame } as unknown as IpcMainInvokeEvent;
  return { handlers, calls, messages, event, destroy: () => { destroyed = true; } };
}

test('window buttons operate on the native window and close through the saving path', () => {
  const { handlers, event, calls, messages } = fixture();
  assert.deepEqual(handlers.get(WINDOW_STATE_CHANNEL)!(event), { maximized: false });
  handlers.get(WINDOW_MAXIMIZE_CHANNEL)!(event);
  assert.deepEqual(handlers.get(WINDOW_STATE_CHANNEL)!(event), { maximized: true });
  handlers.get(WINDOW_MAXIMIZE_CHANNEL)!(event);
  handlers.get(WINDOW_MINIMIZE_CHANNEL)!(event);
  handlers.get(WINDOW_CLOSE_CHANNEL)!(event);
  assert.deepEqual(calls, ['minimize', 'close']);
  assert.deepEqual(messages, [
    { channel: WINDOW_STATE_CHANGED_CHANNEL, state: { maximized: true } },
    { channel: WINDOW_STATE_CHANGED_CHANNEL, state: { maximized: false } },
  ]);
});

test('window IPC rejects other windows, subframes and destroyed windows', () => {
  const { handlers, event, calls, destroy } = fixture();
  for (const handler of handlers.values()) {
    assert.throws(() => handler({ ...event, sender: {} } as IpcMainInvokeEvent), /main frame/);
    assert.throws(() => handler({ ...event, senderFrame: {} } as IpcMainInvokeEvent), /main frame/);
  }
  destroy();
  for (const handler of handlers.values()) assert.throws(() => handler(event), /main frame/);
  assert.deepEqual(calls, []);
});
