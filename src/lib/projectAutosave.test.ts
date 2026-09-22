import test from 'node:test';
import assert from 'node:assert/strict';
import { createProjectAutosave } from './projectAutosave';
import { createProjectSaveRegistry } from './projectSaveLifecycle';

const snapshot = (prompt: string) => ({
  nodes: [{ id: 'node', type: 'promptNode', position: { x: 0, y: 0 }, data: { prompt } }],
  edges: [], assets: {},
});
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
};

test('an edit immediately becomes pending and flush bypasses the debounce', async () => {
  const saved: string[] = [];
  const statuses: string[] = [];
  const saver = createProjectAutosave({
    initialSnapshot: snapshot('old'),
    save: async (value) => { saved.push(value.nodes[0].data.prompt!); },
    onStatusChange: (status) => statuses.push(status),
  });
  saver.update(snapshot('new'));
  assert.equal(saver.isPending(), true);
  assert.deepEqual(statuses, ['saving']);
  assert.deepEqual(saved, []);
  await saver.flush();
  assert.deepEqual(saved, ['new']);
  assert.equal(saver.isPending(), false);
  assert.equal(statuses.at(-1), 'saved');
});

test('flush waits for in-flight saves and writes edits made while saving in order', async () => {
  const firstWrite = deferred();
  const writes: string[] = [];
  const saver = createProjectAutosave({
    initialSnapshot: snapshot('old'),
    save: async (value) => {
      writes.push(value.nodes[0].data.prompt!);
      if (writes.length === 1) await firstWrite.promise;
    },
    onStatusChange: () => {},
  });
  saver.update(snapshot('first'));
  const flushing = saver.flush();
  saver.update(snapshot('latest'));
  assert.equal(saver.flush(), flushing);
  assert.equal(saver.isPending(), true);
  firstWrite.resolve();
  await flushing;
  assert.deepEqual(writes, ['first', 'latest']);
  assert.equal(saver.isPending(), false);
});

test('a failed save rejects close requests and can be retried without losing the snapshot', async () => {
  const statuses: string[] = [];
  let fail = true;
  const saver = createProjectAutosave({
    initialSnapshot: snapshot('old'),
    save: async () => { if (fail) throw new Error('disk full'); },
    onStatusChange: (status) => statuses.push(status),
  });
  const registry = createProjectSaveRegistry();
  registry.register(saver);
  saver.update(snapshot('unsaved'));
  await assert.rejects(registry.flush(), /disk full/);
  assert.equal(registry.hasPending(), true);
  assert.equal(statuses.at(-1), 'error');
  fail = false;
  await registry.flush();
  assert.equal(registry.hasPending(), false);
});

test('leaving a project retains its captured snapshot and close waits for its outstanding save', async () => {
  const writing = deferred();
  const writes: string[] = [];
  const saver = createProjectAutosave({
    initialSnapshot: snapshot('A'),
    save: async (value) => { writes.push(value.nodes[0].data.prompt!); await writing.promise; },
    onStatusChange: () => {},
  });
  const registry = createProjectSaveRegistry();
  const detach = registry.register(saver);
  saver.update(snapshot('edited A'));
  detach();
  assert.equal(registry.hasPending(), true);
  let closed = false;
  const closing = registry.flush().then(() => { closed = true; });
  await Promise.resolve();
  assert.equal(closed, false);
  writing.resolve();
  await closing;
  assert.deepEqual(writes, ['edited A']);
  assert.equal(registry.hasPending(), false);
});


test('deleting a project waits for its active write and discards further pending saves', async () => {
  const registry = createProjectSaveRegistry();
  const writing = deferred();
  const events: string[] = [];
  const saver = createProjectAutosave({ initialSnapshot: snapshot('old'),
    save: async () => { events.push('write'); await writing.promise; }, onStatusChange: () => {} });
  registry.register(saver, 'A');
  saver.update(snapshot('first'));
  const flush = registry.flush();
  await Promise.resolve();
  await Promise.resolve();
  saver.update(snapshot('second'));
  const deleting = registry.deleteProject('A', async () => { events.push('delete'); });
  assert.deepEqual(events, ['write']);
  writing.resolve();
  await Promise.all([flush, deleting]);
  await registry.flush();
  assert.deepEqual(events, ['write', 'delete']);
  assert.equal(registry.hasPending(), false);
});

test('failed deletion preserves the dirty snapshot; successful deletion clears only that project', async () => {
  const registry = createProjectSaveRegistry();
  let failSave = true;
  const writes: string[] = [];
  const saver = createProjectAutosave({ initialSnapshot: snapshot('old'),
    save: async value => { if (failSave) throw Error('disk full'); writes.push(value.nodes[0].data.prompt!); }, onStatusChange: () => {} });
  registry.register(saver, 'A');
  saver.update(snapshot('unsaved'));
  await assert.rejects(registry.flush(), /disk full/);
  await assert.rejects(registry.deleteProject('A', async () => { throw Error('delete failed'); }), /delete failed/);
  assert.equal(registry.hasPending(), true);
  failSave = false;
  await registry.flush();
  assert.deepEqual(writes, ['unsaved']);
  saver.update(snapshot('delete this'));
  const other = createProjectAutosave({ initialSnapshot: snapshot('B'), save: async value => { writes.push(value.nodes[0].data.prompt!); }, onStatusChange: () => {} });
  registry.register(other, 'B');
  other.update(snapshot('keep B'));
  await registry.deleteProject('A', async () => {});
  await registry.flush();
  assert.deepEqual(writes, ['unsaved', 'keep B']);
});
