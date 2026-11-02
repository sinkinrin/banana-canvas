import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { LogStore } from '../../electron/logStore';
import { appLog, protectLogText, rememberLogSecrets, sanitizeLogValue, setAppLogSink, type AppLogEvent } from './appLog';
import { createRuntimeConfigManager } from './runtimeConfig';
import { createRuntimeSettingsStore } from './runtimeSettings';

function temporary(t: test.TestContext) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'banana-logs-'));
  t.after(() => { setAppLogSink(undefined); fs.rmSync(directory, { recursive: true, force: true }); });
  return directory;
}

test('normal mode, debug persistence, restart history, pagination and filtered search', async (t) => {
  const directory = temporary(t);
  const store = new LogStore(directory);
  store.write({ level: 'debug', module: 'network', message: 'hidden' });
  assert.equal((await store.query()).entries.length, 0);
  store.setMode('debug');
  for (let i = 0; i < 230; i++) store.write({ level: 'debug', module: 'network', message: `attempt ${i}`, requestId: `request-${i}` });
  const page = await store.query({ level: 'debug' });
  assert.equal(page.entries.length, 200); assert.equal(page.hasMore, true);
  const older = await store.query({ level: 'debug', before: page.entries[0].id });
  assert.equal(older.entries.length, 30); assert.equal(older.hasMore, false);
  assert.equal(new Set([...older.entries, ...page.entries].map((entry) => entry.id)).size, 230);
  assert.equal((await store.query({ search: 'request-229', module: 'network' })).entries.length, 1);
  const restarted = new LogStore(directory);
  assert.equal(restarted.state().mode, 'debug');
  assert.equal((await restarted.query()).entries.length, 0);
  assert.equal((await restarted.query({ session: 'all' })).entries.length, 200);
  restarted.setMode('normal');
  assert.equal(new LogStore(directory).state().mode, 'normal');
});

test('rotation remains bounded and export includes retained logs and safe environment', async (t) => {
  const directory = temporary(t);
  const store = new LogStore(directory, 1500, 3);
  for (let i = 0; i < 100; i++) store.write({ level: 'info', module: 'test', message: `row ${i}` });
  const files = fs.readdirSync(directory).filter((file) => file.endsWith('.log'));
  assert.equal(files.length, 3);
  assert.ok(files.every((file) => fs.statSync(path.join(directory, file)).size <= 1500));
  assert.equal((await store.query()).entries.at(-1)?.message, 'row 99');
  const destination = path.join(directory, 'export.txt');
  await store.exportTo(destination, { appVersion: 'test', apiKey: 'do-not-export' });
  const exported = fs.readFileSync(destination, 'utf8');
  assert.match(exported, /row 99/); assert.match(exported, /appVersion/); assert.doesNotMatch(exported, /do-not-export/);
});

test('logging strips secrets, URL credentials, query tokens, image data and reflected prompts before persistence', async (t) => {
  const directory = temporary(t);
  const store = new LogStore(directory);
  setAppLogSink((entry) => store.write(entry));
  rememberLogSecrets({ API_KEY: 'credential-test-9842' });
  const release = protectLogText('private prompt\nsecond line');
  appLog('error', 'test', 'Authorization: Bearer credential-test-9842', {
    error: new Error('failed credential-test-9842 private prompt\nsecond line https://alice:password@proxy.example:7890/v1?token=token-value'),
    image: 'data:image/png;base64,ABC', prompt: 'another private prompt',
    url: 'https://host.test/v1?api_key=hidden-key', nested: { access_token: 'hidden-token' },
  });
  release();
  const text = fs.readFileSync(path.join(directory, 'app.log'), 'utf8');
  for (const forbidden of ['credential-test-9842', 'private prompt', 'password', 'alice', 'token-value', 'hidden-key', 'hidden-token', 'base64,ABC']) assert.ok(!text.includes(forbidden), forbidden);
  assert.match(text, /proxy.example:7890/); assert.match(text, /REDACTED/);
  const cyclic: Record<string, unknown> = {}; cyclic.self = cyclic;
  assert.doesNotThrow(() => sanitizeLogValue(cyclic));
});

test('settings logs distinguish set/replace/clear, omit no-ops, and never claim rejected settings were applied', (t) => {
  const directory = temporary(t);
  const events: AppLogEvent[] = [];
  setAppLogSink((entry) => events.push(entry));
  const manager = createRuntimeConfigManager({}, { logger: () => {} });
  const store = createRuntimeSettingsStore({ envFilePath: path.join(directory, '.env'), baseEnv: {}, manager });
  store.update(store.get());
  assert.equal(events.length, 0, 'Saving effective defaults must not create change events');
  store.update({ gemini: { apiKey: 'first-private-key' } });
  store.update({ gemini: { apiKey: 'second-private-key', proxyUrl: 'http://user:pass@localhost:7890', proxyEnabled: true } });
  const count = events.length;
  store.update({ gemini: { apiKey: 'second-private-key', proxyUrl: 'http://user:pass@localhost:7890', proxyEnabled: true } });
  assert.equal(events.length, count);
  assert.throws(() => store.update({ image2: { requestTimeoutMs: 1 } }));
  assert.equal(events.length, count);
  store.update({ gemini: { clearApiKey: true } });
  const changes = events.filter((entry) => entry.message === 'Credential changed');
  assert.deepEqual(changes.map((entry) => (entry.details as { action: string }).action), ['set', 'replaced', 'cleared']);
  const text = JSON.stringify(events);
  assert.doesNotMatch(text, /first-private-key|second-private-key|user:pass/);
  assert.match(text, /GEMINI_PROXY_ENABLED/);
  assert.match(text, /localhost:7890/);
});

test('write failure is reported without breaking application work, then recovers', async (t) => {
  const directory = temporary(t);
  const blocked = path.join(directory, 'blocked'); fs.writeFileSync(blocked, 'file');
  const store = new LogStore(blocked);
  assert.doesNotThrow(() => store.write({ level: 'error', module: 'test', message: 'failure' }));
  assert.equal(store.state().writeError, true);
  fs.rmSync(blocked); fs.mkdirSync(blocked);
  store.write({ level: 'info', module: 'test', message: 'recovered' });
  assert.equal(store.state().writeError, false);
  assert.equal((await store.query()).entries[0].message, 'recovered');
});
