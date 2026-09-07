import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import type { IpcMain, WebContents } from 'electron';
import { createProjectSaveBridge } from '../../electron/projectSaveBridge';
import { PROJECT_SAVES_READY_CHANNEL, PROJECT_SAVES_FLUSH_CHANNEL, PROJECT_SAVES_RESULT_CHANNEL } from '../../electron/ipcChannels';

function fixture(timeoutMs = 1000) {
  const ipc = new EventEmitter();
  const contents = Object.assign(new EventEmitter(), {
    mainFrame: {}, isDestroyed: () => false,
    send: (channel: string, id: number) => requests.push({ channel, id }),
  });
  const requests: { channel: string; id: number }[] = [];
  const bridge = createProjectSaveBridge(ipc as IpcMain, contents as unknown as WebContents, timeoutMs);
  const event = { sender: contents, senderFrame: contents.mainFrame };
  ipc.emit(PROJECT_SAVES_READY_CHANNEL, event);
  return { ipc, contents, bridge, event, requests };
}

test('desktop save handshake waits for the correct main-frame acknowledgement', async () => {
  const { ipc, bridge, event, requests } = fixture();
  let finished = false;
  const result = bridge.flush().then(() => { finished = true; });
  assert.equal(requests[0].channel, PROJECT_SAVES_FLUSH_CHANNEL);
  ipc.emit(PROJECT_SAVES_RESULT_CHANNEL, { ...event, senderFrame: {} }, requests[0].id, true);
  ipc.emit(PROJECT_SAVES_RESULT_CHANNEL, event, requests[0].id + 1, true);
  await Promise.resolve();
  assert.equal(finished, false);
  ipc.emit(PROJECT_SAVES_RESULT_CHANNEL, event, requests[0].id, true);
  await result;
  assert.equal(finished, true);
});

test('desktop flush rejects failed saves and permits a later retry', async () => {
  const { ipc, bridge, event, requests } = fixture();
  const failed = assert.rejects(bridge.flush(), /could not be saved/);
  ipc.emit(PROJECT_SAVES_RESULT_CHANNEL, event, requests[0].id, false);
  await failed;
  const retry = bridge.flush();
  ipc.emit(PROJECT_SAVES_RESULT_CHANNEL, event, requests[1].id, true);
  await retry;
});

test('unresponsive or destroyed renderers cannot acknowledge a successful save', async () => {
  const timeout = fixture(20);
  await assert.rejects(timeout.bridge.flush(), /could not be saved/);
  const destroyed = fixture();
  const rejected = assert.rejects(destroyed.bridge.flush(), /could not be saved/);
  destroyed.contents.emit('destroyed');
  await rejected;
});
