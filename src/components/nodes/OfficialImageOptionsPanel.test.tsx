import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import i18n from '../../i18n';
import { OfficialImageOptionsPanel } from './OfficialImageOptionsPanel';
import { OfficialImagesFields } from '../settings/OfficialImagesFields';
import { MaskEditorModal } from '../mask/MaskEditorModal';

test('official model controls expose available quality, complexity and formats in both languages', async () => {
  for (const language of ['zh-CN', 'en']) {
    await i18n.changeLanguage(language);
    const html = renderToStaticMarkup(<OfficialImageOptionsPanel imageModel="openai-image2.6-sunburst" referenceCount={0} value={{ quality: 'max', complexity: 'high' }} onChange={() => {}} />);
    assert.match(html, /value="max" selected/); assert.match(html, /name="officialImage.complexity"/);
    for (const format of ['png', 'jpeg', 'webp', 'svg', 'gif']) assert.match(html, new RegExp(`value="${format}"`));
    assert.doesNotMatch(html, /response_format|input_fidelity/);
    const edit = renderToStaticMarkup(<OfficialImageOptionsPanel imageModel="openai-image2.6-flare" referenceCount={1} onChange={() => {}} />);
    assert.match(edit, /value="svg" disabled/); assert.match(edit, /value="gif" disabled/);
  }
  await i18n.changeLanguage('zh-CN');
});
test('GIF controls omit streaming, SVG controls expose author configuration, markup editor is selectable', () => {
  const gif = renderToStaticMarkup(<OfficialImageOptionsPanel imageModel="openai-image2.6-flare" value={{ outputFormat: 'gif' }} referenceCount={0} onChange={() => {}} />);
  assert.match(gif, /name="officialImage.frameCount"/); assert.doesNotMatch(gif, /name="officialImage.stream"/);
  const svg = renderToStaticMarkup(<OfficialImageOptionsPanel imageModel="openai-image2.6-flare" value={{ outputFormat: 'svg', svgModel: 'author-model' }} referenceCount={0} onChange={() => {}} />);
  assert.match(svg, /author-model/); assert.match(svg, /name="officialImage.svgReasoning"/);
  const editor = renderToStaticMarkup(<MaskEditorModal allowMarkup title="edit" sourceImage={{ data: 'aW1hZ2U=', mimeType: 'image/png', url: 'data:image/png;base64,aW1hZ2U=' }} onClose={() => {}} onGenerate={async () => {}} />);
  assert.match(editor, /value="markup"/);
});
test('official settings provide independent credentials, strict proxy controls and the official catalog', () => {
  const html = renderToStaticMarkup(<OfficialImagesFields value={{ baseUrl: 'https://api.openai.com/v1', apiKey: '', clearApiKey: false, proxyUrl: 'http://127.0.0.1:7890', proxyEnabled: true, stream: true, requestTimeoutMs: 600000, organization: '', project: '' }} onChange={() => {}} />);
  assert.match(html, /<input(?=[^>]*name="officialImages.apiKey")(?=[^>]*type="password")/); assert.match(html, /name="officialImages.proxyEnabled"/);
  assert.match(html, /127.0.0.1:7890/);
});
