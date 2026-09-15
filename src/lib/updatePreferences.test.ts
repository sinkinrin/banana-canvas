import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createUpdatePreferencesStore } from '../../electron/updatePreferences';

test('desktop automatic updates default to disabled and persist explicit opt-in', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'banana-update-preferences-'));
  const filePath = path.join(dir, 'updates.json');
  try {
    const store = createUpdatePreferencesStore(filePath);
    assert.deepEqual(store.get(), { automaticUpdatesEnabled: false, checkOnStartupEnabled: true });
    fs.writeFileSync(filePath, JSON.stringify({ automaticUpdatesEnabled: false }));
    assert.equal(store.get().checkOnStartupEnabled, true);

    store.replace({ automaticUpdatesEnabled: true });
    assert.deepEqual(store.get(), { automaticUpdatesEnabled: true, checkOnStartupEnabled: true });
    store.replace({ checkOnStartupEnabled: false });
    assert.deepEqual(createUpdatePreferencesStore(filePath).get(), { automaticUpdatesEnabled: true, checkOnStartupEnabled: false });
    store.replace({ automaticUpdatesEnabled: false });
    assert.equal(store.get().checkOnStartupEnabled, false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('invalid update preference files safely fall back to disabled', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'banana-update-preferences-invalid-'));
  const filePath = path.join(dir, 'updates.json');
  try {
    fs.writeFileSync(filePath, '{broken');
    assert.deepEqual(createUpdatePreferencesStore(filePath).get(), {
      automaticUpdatesEnabled: false,
      checkOnStartupEnabled: true,
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
