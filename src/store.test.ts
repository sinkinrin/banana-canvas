import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';

const { useStore } = await import('./store');

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
