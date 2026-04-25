import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';

import { MaskCompareModal } from './MaskCompareModal';
import { MaskEditorModal } from './MaskEditorModal';

const sourceImage = {
  data: 'b3JpZ2luYWw=',
  mimeType: 'image/png',
  url: 'data:image/png;base64,b3JpZ2luYWw=',
};

test('MaskEditorModal renders mask controls and disables generate until ready', () => {
  const html = renderToStaticMarkup(
    <MaskEditorModal
      title="局部编辑参考图"
      sourceImage={sourceImage}
      onClose={() => {}}
      onGenerate={async () => {}}
    />
  );

  assert.match(html, /局部编辑参考图/);
  assert.match(html, /画笔/);
  assert.match(html, /橡皮/);
  assert.match(html, /撤销/);
  assert.match(html, /清空/);
  assert.match(html, /生成局部修改/);
  assert.match(html, /涂抹区域会作为透明区域发送/);
  assert.match(html, /disabled=""/);
});

test('MaskCompareModal renders original and generated images side by side', () => {
  const html = renderToStaticMarkup(
    <MaskCompareModal
      originalImageUrl="data:image/png;base64,b3JpZ2luYWw="
      generatedImageUrl="data:image/png;base64,bmV3"
      prompt="把帽子改成红色"
      onClose={() => {}}
      onContinueEdit={() => {}}
      onUseAsReference={() => {}}
    />
  );

  assert.match(html, /原图/);
  assert.match(html, /新图/);
  assert.match(html, /把帽子改成红色/);
  assert.match(html, /继续编辑新图/);
  assert.match(html, /以新图为参考/);
});
