import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createLocalPromptStore } from './localPromptStore';

test('local prompt store persists CRUD operations in one cross-project library', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'banana-prompts-'));
  try {
    const store = createLocalPromptStore(dir);
    const created = await store.create({
      title: '  海报模板  ',
      content: '  电影感海报，金色主光  ',
      tags: ['海报', ' 海报 ', '电影感'],
    });
    assert.equal(created.title, '海报模板');
    assert.equal(created.content, '电影感海报，金色主光');
    assert.deepEqual(created.tags, ['海报', '电影感']);

    const updated = await store.update(created.id, {
      title: '新版海报',
      content: created.content,
      tags: ['KV'],
    });
    assert.equal(updated?.title, '新版海报');

    const reopened = createLocalPromptStore(dir);
    assert.deepEqual((await reopened.list()).map((item) => item.title), ['新版海报']);
    assert.equal(await reopened.delete(created.id), true);
    assert.deepEqual(await reopened.list(), []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('local prompt store rejects empty or oversized fields', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'banana-prompts-invalid-'));
  try {
    const store = createLocalPromptStore(dir);
    await assert.rejects(store.create({ title: '', content: ' ', tags: [] }), /Prompt content/);
    await assert.rejects(store.create({ title: 'x'.repeat(121), content: 'draw', tags: [] }), /Prompt title/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
