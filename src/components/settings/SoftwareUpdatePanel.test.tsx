import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';

import { describeUpdateState, SoftwareUpdatePanel } from './SoftwareUpdatePanel';

test('software update panel explains manual updates and disabled-by-default automation', () => {
  const html = renderToStaticMarkup(<SoftwareUpdatePanel />);

  assert.match(html, /手动检查更新/);
  assert.match(html, /自动更新默认关闭/);
  assert.match(html, /SmartScreen/);
});

test('desktop update state descriptions cover progress and readiness', () => {
  assert.equal(describeUpdateState({
    supported: true,
    currentVersion: '0.4.0',
    automaticUpdatesEnabled: false,
    phase: 'available',
    latestVersion: '0.5.0',
    releaseNotes: '',
  }), '发现新版本 v0.5.0');
  assert.equal(describeUpdateState({
    supported: true,
    currentVersion: '0.4.0',
    automaticUpdatesEnabled: false,
    phase: 'downloaded',
    latestVersion: '0.5.0',
    releaseNotes: '',
  }), 'v0.5.0 已下载，等待安装');
});
