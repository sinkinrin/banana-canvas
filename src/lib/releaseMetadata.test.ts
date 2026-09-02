import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  createClientReleaseNotes,
  embedReleaseNotesInLatestMetadata,
} from '../../scripts/release-metadata.mjs';

test('release metadata embeds the current changelog for the desktop update UI', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'banana-latest-yml-'));
  const latestPath = path.join(dir, 'latest.yml');
  const changelog = [
    '# Changelog',
    '',
    '## [0.5.0] - 2026-09-02',
    '',
    '### 新增',
    '',
    '- 提示词管理',
    '',
    '## [0.4.0] - 2026-09-01',
    '',
    '- previous',
  ].join('\n');
  try {
    fs.writeFileSync(latestPath, 'version: 0.5.0\npath: setup.exe\n');
    embedReleaseNotesInLatestMetadata(latestPath, changelog, '0.5.0');
    const metadata = fs.readFileSync(latestPath, 'utf8');

    assert.match(metadata, /^releaseName: "Banana Canvas v0\.5\.0"$/m);
    assert.match(metadata, /^releaseNotes: \|-$/m);
    assert.match(metadata, /^  - 提示词管理$/m);
    assert.match(metadata, /SmartScreen/);
    assert.doesNotMatch(metadata, /previous/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('client release notes always retain the unsigned installer warning', () => {
  const notes = createClientReleaseNotes('## [1.0.0]\n\n- release', '1.0.0');
  assert.match(notes, /release/);
  assert.match(notes, /未进行代码签名/);
});
