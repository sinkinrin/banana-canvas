import test from 'node:test';
import assert from 'node:assert/strict';
import { OFFICIAL_IMAGE_MODELS, validateOfficialImageOptions, officialImageRequestFields, resolveOfficialImageSize } from './officialImages';
import { getImageModelConfig, createImage2Config } from './imageModels';
import { validateGenerateImageRequest } from '../server/requestValidation';
import { normalizeNodeDataWithAssets, createPersistedSnapshot } from './canvasState';
import { buildImageDownloadFileName } from './imageDownloads';

const model = 'openai-image2.6-flare';
test('official model identities are separate from legacy CPA identities', () => {
  for (const id of Object.keys(OFFICIAL_IMAGE_MODELS)) assert.equal(getImageModelConfig(id).provider, 'openai-images');
  assert.equal(getImageModelConfig('image2.5-flare').provider, 'openai-chat');
  assert.equal(createImage2Config({ IMAGE2_BASE_URL: 'https://cpa.example/v1', IMAGE2_API_KEY: 'legacy' }, 'image2.5-flare').model, 'gpt-image-2.5-flare');
});
test('official generation fields preserve documented controls without legacy parameters', () => {
  const fields = officialImageRequestFields(model, 'icon', { quality: 'max', complexity: 'low', size: '1536x864', background: 'transparent', outputFormat: 'webp', outputCompression: 73, moderation: 'auto', n: 3, stream: true, partialImages: 2, safetyIdentifier: 'anonymous-17' }, '1024x1024');
  assert.deepEqual(fields, { model: 'gpt-image-2.6-flare', prompt: 'icon', size: '1536x864', quality: 'max', complexity: 'low', background: 'transparent', output_format: 'webp', output_compression: 73, moderation: 'auto', n: 3, stream: true, partial_images: 2, safety_identifier: 'anonymous-17' });
});
test('official validation rejects incompatible feature combinations and preserves documented GIF range', () => {
  for (const options of [ { quality: 'max' }, { complexity: 'high' }, { size: 'auto' }, { size: '1536x864' }, { outputFormat: 'gif', frameCount: 64, frameDurationMs: 2000 }, { outputFormat: 'svg', svgModel: 'author-model', svgReasoning: 'high' } ]) assert.equal(validateOfficialImageOptions(options, model, 0, false, false), undefined);
  for (const options of [ { outputFormat: 'svg', n: 2 }, { outputFormat: 'gif', stream: true }, { outputFormat: 'svg', partialImages: 0 }, { background: 'transparent', outputFormat: 'jpeg' }, { outputCompression: 50, outputFormat: 'png' }, { frameCount: 9 }, { size: '1025x1024' }, { size: '3840x3840' }, { response_format: 'url' }, { imageInputs: [{ file_id: 'file-1', image_url: 'https://example.com/a.png' }] } ]) assert.ok(validateOfficialImageOptions(options, model, 0, false, false), JSON.stringify(options));
  assert.ok(validateOfficialImageOptions({}, model, 1, true, true));
  assert.ok(validateOfficialImageOptions({ outputFormat: 'svg' }, model, 1, false, false));
  assert.ok(validateOfficialImageOptions({ complexity: 'low' }, 'openai-image2.5-flare', 0, false, false));
  assert.ok(validateOfficialImageOptions({ quality: 'max' }, 'openai-image2', 0, false, false));
});
test('all official presets satisfy dimensions, aspect and pixel constraints', () => {
  for (const size of ['1K', '2K', '4K']) for (const ratio of ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9']) {
    const dimensions = resolveOfficialImageSize(ratio, size);
    assert.equal(validateOfficialImageOptions({ size: dimensions }, model, 0, false, false), undefined, `${ratio} ${size} ${dimensions}`);
  }
});
test('official inputs permit 16 references and 32000 prompt characters while legacy limits remain', () => {
  const refs = Array.from({ length: 16 }, () => ({ data: 'aW1hZ2U=', mimeType: 'image/png' }));
  assert.equal(validateGenerateImageRequest({ imageModel: model, prompt: 'a'.repeat(32000), referenceImages: refs }).ok, true);
  assert.equal(validateGenerateImageRequest({ imageModel: 'image2', prompt: 'a', referenceImages: refs }).ok, false);
  assert.equal(validateGenerateImageRequest({ imageModel: model, prompt: 'a', referenceImages: [...refs, refs[0]] }).ok, false);
});
test('official options and all reference assets survive snapshots; partial previews do not', () => {
  const assets = Object.fromEntries(Array.from({ length: 16 }, (_, index) => [`ref-${index}`, { id: `ref-${index}`, data: 'aW1hZ2U=', mimeType: 'image/png' }]));
  const normalized = normalizeNodeDataWithAssets({ imageModel: model, referenceImageIds: Object.keys(assets), officialImageOptions: { quality: 'max', complexity: 'medium', outputFormat: 'gif', frameCount: 17 }, previewImageUrl: 'data:image/png;base64,cGFydGlhbA==' }, assets);
  const snapshot = createPersistedSnapshot({ nodes: [{ id: 'node', type: 'promptNode', position: { x: 0, y: 0 }, data: normalized.data }], edges: [], assets });
  assert.equal(snapshot.nodes[0].data.referenceImageIds?.length, 16);
  assert.equal(snapshot.nodes[0].data.officialImageOptions?.frameCount, 17);
  assert.equal(snapshot.nodes[0].data.previewImageUrl, undefined);
  assert.equal(buildImageDownloadFileName(123, 'data:image/svg+xml;base64,PHN2Zy8+'), 'banana-art-123.svg');
});
