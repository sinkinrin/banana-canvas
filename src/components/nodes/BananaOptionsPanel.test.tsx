import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';

import { BananaOptionsPanel } from './BananaOptionsPanel';

test('BananaOptionsPanel renders official Banana2 controls and parameter tips', () => {
  const html = renderToStaticMarkup(
    <BananaOptionsPanel
      value={{
        responseMode: 'image',
        thinkingLevel: 'HIGH',
        mediaResolution: 'MEDIA_RESOLUTION_HIGH',
        searchGrounding: true,
        safetySettings: {
          HARM_CATEGORY_HARASSMENT: 'BLOCK_ONLY_HIGH',
        },
      }}
      hasReferenceImages
      onChange={() => {}}
    />
  );

  assert.match(html, /Banana2 高级参数/);
  assert.match(html, /思考等级/);
  assert.match(html, /参考图解析/);
  assert.match(html, /Search grounding/);
  assert.match(html, /aria-label="参数说明"/);
  assert.doesNotMatch(html, /默认 Text\+Image/);
  assert.doesNotMatch(html, /显式 Text\+Image/);
  assert.doesNotMatch(html, /低风险及以上/);
  assert.doesNotMatch(html, /仅高风险/);
  assert.match(html, /固定仅返回图片/);
  assert.match(html, /安全过滤固定关闭/);
  assert.match(html, /Image2/);
  assert.match(html, /transparent/);
});

test('BananaOptionsPanel disables mediaResolution without reference images', () => {
  const html = renderToStaticMarkup(
    <BananaOptionsPanel
      value={{ mediaResolution: 'MEDIA_RESOLUTION_HIGH' }}
      hasReferenceImages={false}
      onChange={() => {}}
    />
  );

  assert.match(html, /<select disabled=""/);
  assert.match(html, /value="MEDIA_RESOLUTION_HIGH" selected="">high/);
  assert.match(html, /纯文生图发送会被 Gemini 拒绝/);
});
