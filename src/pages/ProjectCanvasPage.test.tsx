import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';

import { ProjectNameDialog } from '../components/projects/ProjectNameDialog';
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

test('hasProjectSnapshotChanged does not stringify full snapshots for identical asset references', () => {
  const createSnapshot = () => ({
    nodes: [
      {
        id: 'image-1',
        type: 'imageNode',
        position: { x: 0, y: 0 },
        data: { imageAssetId: 'asset-1' },
      },
    ],
    edges: [],
    toJSON() {
      throw new Error('snapshot should not be stringified');
    },
    assets: {
      'asset-1': {
        id: 'asset-1',
        mimeType: 'image/png',
        data: 'same-data',
      },
    },
  });

  assert.equal(
    hasProjectSnapshotChanged(
      createSnapshot() as any,
      createSnapshot() as any
    ),
    false
  );
});

test('hasProjectSnapshotChanged detects same-id asset content changes', () => {
  assert.equal(
    hasProjectSnapshotChanged(
      {
        nodes: [
          {
            id: 'image-1',
            type: 'imageNode',
            position: { x: 0, y: 0 },
            data: { imageAssetId: 'asset-1' },
          },
        ],
        edges: [],
        assets: {
          'asset-1': { id: 'asset-1', mimeType: 'image/png', data: 'old-data' },
        },
      },
      {
        nodes: [
          {
            id: 'image-1',
            type: 'imageNode',
            position: { x: 0, y: 0 },
            data: { imageAssetId: 'asset-1' },
          },
        ],
        edges: [],
        assets: {
          'asset-1': { id: 'asset-1', mimeType: 'image/png', data: 'new-data' },
        },
      }
    ),
    true
  );
});

test('hasProjectSnapshotChanged detects asset reference changes from metadata', () => {
  assert.equal(
    hasProjectSnapshotChanged(
      {
        nodes: [],
        edges: [],
        assets: {
          'asset-1': { id: 'asset-1', mimeType: 'image/png', data: 'old' },
        },
      },
      {
        nodes: [],
        edges: [],
        assets: {
          'asset-2': { id: 'asset-2', mimeType: 'image/png', data: 'new' },
        },
      }
    ),
    true
  );
});

test('project canvas rename dialog renders with project name input', () => {
  const html = renderToStaticMarkup(
    <ProjectNameDialog
      title="重命名项目"
      initialValue="海报项目"
      confirmLabel="保存"
      cancelLabel="取消"
      onConfirm={() => {}}
      onCancel={() => {}}
    />
  );

  assert.match(html, /重命名项目/);
  assert.match(html, /value="海报项目"/);
  assert.match(html, /保存/);
});
