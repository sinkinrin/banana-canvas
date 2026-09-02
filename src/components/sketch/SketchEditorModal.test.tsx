import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';

import { SketchEditorModal } from './SketchEditorModal';

test('SketchEditorModal renders a fixed-ratio QuickDraw workflow', () => {
  const html = renderToStaticMarkup(
    <SketchEditorModal
      aspectRatio="16:9"
      onClose={() => {}}
      onApply={() => {}}
    />
  );

  assert.match(html, /构图草图/);
  assert.match(html, /当前画幅 16:9/);
  assert.match(html, /画笔/);
  assert.match(html, /橡皮/);
  assert.match(html, /选择/);
  assert.match(html, /应用为参考图/);
  assert.match(html, /disabled=""/);
  assert.match(html, /data-sketch-editor-modal="true"/);
});
