import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';

const { useStore } = await import('./store');

test('new prompt nodes default to Image2', () => {
  useStore.setState({ nodes: [], edges: [], assets: {}, assetsHydrated: true });

  const id = useStore.getState().addNode('promptNode', { x: 10, y: 20 }, { prompt: 'draw' });
  const node = useStore.getState().nodes.find((item) => item.id === id);

  assert.equal(node?.data.imageModel, 'image2');
});

test('saving an editable sketch adds one reference and later replaces it in place', () => {
  const temporal = useStore.temporal.getState();
  temporal.clear();
  useStore.setState({
    nodes: [{
      id: 'prompt-with-sketch',
      type: 'promptNode',
      position: { x: 0, y: 0 },
      data: { prompt: 'draw a person', referenceImageIds: ['style-reference'] },
    }],
    edges: [],
    assets: {
      'style-reference': { id: 'style-reference', data: 'c3R5bGU=', mimeType: 'image/png' },
    },
    assetsHydrated: true,
  });
  temporal.clear();

  const first = useStore.getState().saveNodeSketch('prompt-with-sketch', {
    aspectRatio: '16:9',
    image: { data: 'Zmlyc3Q=', mimeType: 'image/png', url: 'data:image/png;base64,Zmlyc3Q=' },
    snapshot: { document: { store: {} } },
  });
  assert.equal(first.ok, true);
  const firstAssetId = first.ok ? first.assetId : '';
  let node = useStore.getState().nodes[0];
  assert.deepEqual(node.data.referenceImageIds, ['style-reference', firstAssetId]);
  assert.equal(node.data.sketch?.referenceImageAssetId, firstAssetId);

  const second = useStore.getState().saveNodeSketch('prompt-with-sketch', {
    aspectRatio: '16:9',
    image: { data: 'c2Vjb25k', mimeType: 'image/png', url: 'data:image/png;base64,c2Vjb25k' },
    snapshot: { document: { store: {} } },
  });
  assert.equal(second.ok, true);
  const secondAssetId = second.ok ? second.assetId : '';
  node = useStore.getState().nodes[0];
  assert.deepEqual(node.data.referenceImageIds, ['style-reference', secondAssetId]);
  assert.equal(node.data.sketch?.referenceImageAssetId, secondAssetId);
  assert.equal(useStore.getState().assets[secondAssetId].data, 'c2Vjb25k');
});

test('saving a new sketch reports the existing four-reference limit', () => {
  useStore.setState({
    nodes: [{
      id: 'full-prompt',
      type: 'promptNode',
      position: { x: 0, y: 0 },
      data: { referenceImageIds: ['a', 'b', 'c', 'd'] },
    }],
    edges: [],
    assets: {},
    assetsHydrated: true,
  });

  const result = useStore.getState().saveNodeSketch('full-prompt', {
    aspectRatio: '1:1',
    image: { data: 'c2tldGNo', mimeType: 'image/png', url: 'data:image/png;base64,c2tldGNo' },
    snapshot: { document: { store: {} } },
  });

  assert.deepEqual(result, {
    ok: false,
    error: '参考图已达到 4 张上限，请先移除一张再应用草图。',
  });
});

test('hydrateProject does not leave the previous project in undo history', () => {
  const temporal = useStore.temporal.getState();

  temporal.clear();
  useStore.setState({
    nodes: [
      {
        id: 'previous-project-node',
        type: 'promptNode',
        position: { x: 10, y: 20 },
        data: { prompt: 'previous project' },
      },
    ],
    edges: [],
    assets: {},
    assetsHydrated: true,
  });
  temporal.clear();

  useStore.getState().hydrateProject({
    nodes: [
      {
        id: 'loaded-project-node',
        type: 'promptNode',
        position: { x: 30, y: 40 },
        data: { prompt: 'loaded project' },
      },
    ],
    edges: [],
    assets: {},
  });

  assert.equal(useStore.getState().nodes[0].id, 'loaded-project-node');
  assert.equal(useStore.temporal.getState().pastStates.length, 0);
  assert.equal(useStore.temporal.getState().futureStates.length, 0);
});
