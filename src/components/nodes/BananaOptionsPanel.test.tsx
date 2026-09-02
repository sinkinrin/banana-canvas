import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';

import { BananaOptionsPanel } from './BananaOptionsPanel';

test('BananaOptionsPanel renders official Banana2 controls and parameter tips', () => {
  const html = renderToStaticMarkup(
    <BananaOptionsPanel
      imageModel="banana"
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

  assert.match(html, /Banana 2 高级参数/);
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
      imageModel="banana"
      value={{ mediaResolution: 'MEDIA_RESOLUTION_HIGH' }}
      hasReferenceImages={false}
      onChange={() => {}}
    />
  );

  assert.match(html, /<select disabled=""/);
  assert.match(html, /value="MEDIA_RESOLUTION_HIGH" selected="">high/);
  assert.match(html, /纯文生图发送会被 Gemini 拒绝/);
});

test('BananaOptionsPanel exposes Lite thinking controls and disables Search', () => {
  const html = renderToStaticMarkup(
    <BananaOptionsPanel
      imageModel="banana-lite"
      value={{ thinkingLevel: 'HIGH', searchGrounding: true }}
      hasReferenceImages
      onChange={() => {}}
    />
  );

  assert.match(html, /Banana 2 Lite 高级参数/);
  assert.match(html, /极速低成本/);
  assert.match(html, /minimal 最低延迟/);
  assert.match(html, /value="HIGH" selected="">high 高推理/);
  assert.match(html, /Lite 不支持/);
  assert.doesNotMatch(html, /开启 Google Search/);
});

test('BananaOptionsPanel keeps Search available for Pro while thinking is model-managed', () => {
  const html = renderToStaticMarkup(
    <BananaOptionsPanel
      imageModel="banana-pro"
      value={{ mediaResolution: 'MEDIA_RESOLUTION_HIGH', searchGrounding: true }}
      hasReferenceImages
      onChange={() => {}}
    />
  );

  assert.match(html, /Banana Pro 高级参数/);
  assert.match(html, /专业复杂任务/);
  assert.match(html, /模型自动管理/);
  assert.match(html, /模型不支持/);
  assert.match(html, /不会发送 mediaResolution/);
  assert.doesNotMatch(html, /value="MEDIA_RESOLUTION_HIGH" selected/);
  assert.match(html, /开启 Google Search/);
});
