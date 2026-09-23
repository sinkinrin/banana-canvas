import test from 'node:test';
import assert from 'node:assert/strict';
import { assignNodeCategory, getNodeCategories, inheritNodeCategory, renameNodeCategory } from './nodeCategories';
import { createPersistedSnapshot, type CanvasNode } from './canvasState';
import { useStore } from '../store';

test('categories preserve legacy colors, share names, count members and survive save and undo', () => {
  const nodes: CanvasNode[] = ['a', 'b', 'c'].map(id => ({ id, type: 'promptNode', position: { x: 0, y: 0 }, data: id === 'a' ? { color: '#3b82f6' } : {} }));
  let grouped = assignNodeCategory(nodes, 'b', '#3b82f6');
  grouped = renameNodeCategory(grouped, '#3b82f6', ' 产品 A ');
  assert.equal(grouped[0].data.categoryName, '产品 A');
  assert.equal(grouped[1].data.categoryName, '产品 A');
  assert.deepEqual(getNodeCategories(grouped)[0].ids, ['a', 'b']);
  const result = { ...nodes[2], type: 'imageNode', data: inheritNodeCategory(grouped[0].data) };
  const saved = createPersistedSnapshot({ nodes: [...grouped.slice(0, 2), result], edges: [], assets: {} });
  assert.deepEqual(getNodeCategories(saved.nodes)[0], { color: '#3b82f6', name: '产品 A', ids: ['a', 'b', 'c'] });
  const cleared = assignNodeCategory(saved.nodes, 'a', '');
  assert.equal(cleared[0].data.color, undefined);
  assert.equal(cleared[0].data.categoryName, undefined);
  assert.equal(cleared[1].data.categoryName, '产品 A');
  useStore.setState({ nodes: saved.nodes, edges: [], assets: {} });
  useStore.temporal.getState().clear();
  useStore.setState(state => ({ nodes: renameNodeCategory(state.nodes, '#3b82f6', '场景图') }));
  useStore.temporal.getState().undo();
  assert.equal(useStore.getState().nodes[0].data.categoryName, '产品 A');
  useStore.temporal.getState().redo();
  assert.equal(useStore.getState().nodes[0].data.categoryName, '场景图');
});
