import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';

import { ProjectCanvasPageView, hasProjectSnapshotChanged } from './ProjectCanvasPage';

test('ProjectCanvasPageView renders project navigation and saved status', () => {
  const html = renderToStaticMarkup(
    <ProjectCanvasPageView
      project={{
        id: 'p1',
        name: '海报项目',
        createdAt: '2026-04-16T10:00:00.000Z',
        updatedAt: '2026-04-16T10:00:00.000Z',
      }}
      saveStatus="saved"
      onBack={() => {}}
      onRename={() => {}}
    >
      <div>画布内容</div>
    </ProjectCanvasPageView>
  );

  assert.match(html, /返回项目列表/);
  assert.match(html, /海报项目/);
  assert.match(html, /已保存/);
  assert.match(html, /画布内容/);
});

test('ProjectCanvasPageView renders autosave failures in the header', () => {
  const html = renderToStaticMarkup(
    <ProjectCanvasPageView
      project={{
        id: 'p1',
        name: '海报项目',
        createdAt: '2026-04-16T10:00:00.000Z',
        updatedAt: '2026-04-16T10:00:00.000Z',
      }}
      saveStatus="error"
      onBack={() => {}}
      onRename={() => {}}
    />
  );

  assert.match(html, /保存失败/);
});

test('hasProjectSnapshotChanged ignores identical persisted snapshots', () => {
  const snapshot = {
    nodes: [
      {
        id: 'prompt-1',
        type: 'promptNode',
        position: { x: 250, y: 250 },
        data: { prompt: '哈基米大旋风', isLoading: false },
      },
    ],
    edges: [],
    assets: {},
  };

  assert.equal(hasProjectSnapshotChanged(snapshot, structuredClone(snapshot)), false);
});

test('hasProjectSnapshotChanged detects real project changes', () => {
  assert.equal(
    hasProjectSnapshotChanged(
      { nodes: [], edges: [], assets: {} },
      {
        nodes: [
          {
            id: 'prompt-1',
            type: 'promptNode',
            position: { x: 250, y: 250 },
            data: { prompt: '哈基米大旋风' },
          },
        ],
        edges: [],
        assets: {},
      }
    ),
    true
  );
});
