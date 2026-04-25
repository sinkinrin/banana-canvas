import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';

import { Image2OptionsPanel } from './Image2OptionsPanel';

test('Image2OptionsPanel renders supported relay controls and compatibility tips', () => {
  const html = renderToStaticMarkup(
    <Image2OptionsPanel
      value={{
        quality: 'high',
        background: 'opaque',
        outputFormat: 'jpeg',
        outputCompression: 72,
        moderation: 'auto',
        stream: 'on',
        partialImages: 2,
        inputFidelity: 'high',
      }}
      hasReferenceImages
      onChange={() => {}}
    />
  );

  assert.match(html, /Image2 高级参数/);
  assert.match(html, /质量/);
  assert.match(html, /输出格式/);
  assert.match(html, /压缩/);
  assert.match(html, /局部图/);
  assert.match(html, /aria-label="参数说明"/);
  assert.doesNotMatch(html, />背景<\/label>/);
  assert.doesNotMatch(html, />审核强度<\/label>/);
  assert.doesNotMatch(html, />流式返回<\/label>/);
  assert.doesNotMatch(html, /transparent 透明/);
  assert.doesNotMatch(html, /参考图保真度不可调/);
  assert.match(html, /n、style、user/);
  assert.match(html, /data URL/);
  assert.match(html, /file_id/);
  assert.match(html, /背景固定 opaque/);
});

test('Image2OptionsPanel does not expose fixed background and transport controls', () => {
  const html = renderToStaticMarkup(
    <Image2OptionsPanel
      value={{
        background: 'transparent',
        moderation: 'auto',
        stream: 'off',
        outputFormat: 'webp',
      }}
      hasReferenceImages={false}
      onChange={() => {}}
    />
  );

  assert.doesNotMatch(html, /transparent 透明/);
  assert.doesNotMatch(html, />背景<\/label>/);
  assert.doesNotMatch(html, />审核强度<\/label>/);
  assert.doesNotMatch(html, />流式返回<\/label>/);
});
