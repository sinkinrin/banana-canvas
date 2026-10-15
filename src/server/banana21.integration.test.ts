import test from 'node:test';
import assert from 'node:assert/strict';
import { createGenerateImagePayload } from '../services/gemini';
import { createPersistedSnapshot, normalizeNodeDataWithAssets } from '../lib/canvasState';
import { buildImageRerunParams, buildReferenceNodeData } from '../components/nodes/useImageNodeActions';
import { validateGenerateImageRequest } from './requestValidation';
import { generateBananaImage } from './providers/banana';
import type { GenerationInfo } from '../lib/generationInfo';

test('Banana 2.1 routes through the SDK and retains model/options across saved results and reruns', async (t) => {
  const calls: Array<{ url: string; body: any }> = [];
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    calls.push({ url: request.url, body: await request.json() });
    return new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: 'iVBORw0KGgo=' } }] }, finishReason: 'STOP' }],
      modelVersion: 'gemini-nano-banana-2.1',
      usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 100 },
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  });
  for (const withReference of [false, true]) {
    const payload = createGenerateImagePayload({
      prompt: 'blue star', imageModel: 'banana-2.1', aspectRatio: '8:1', imageSize: '4K',
      bananaOptions: { thinkingLevel: 'MEDIUM', searchGrounding: true, mediaResolution: 'MEDIA_RESOLUTION_HIGH' },
      referenceImages: withReference ? [{ data: 'c3Rhcg==', mimeType: 'image/png' }] : [],
    });
    const validated = validateGenerateImageRequest(payload);
    assert.equal(validated.ok, true);
    if (!validated.ok) return;
    assert.equal(validated.value.provider, 'gemini');
    const { referenceImages, ...params } = validated.value;
    let info: GenerationInfo | undefined;
    const imageUrl = await generateBananaImage({ ...params, images: referenceImages, apiKey: 'fixture-key', onMetadata: (value) => { info = value; } });
    assert.equal(imageUrl, 'data:image/png;base64,iVBORw0KGgo=');
    assert.equal(info?.apiModel, 'gemini-nano-banana-2.1');
    assert.equal(info?.reportedModel, 'gemini-nano-banana-2.1');
    assert.equal(info?.outputTokens, 100);
    const call = calls.at(-1)!;
    assert.equal(new URL(call.url).pathname, '/v1beta/models/gemini-nano-banana-2.1:generateContent');
    assert.deepEqual(call.body.generationConfig.imageConfig, { aspectRatio: '8:1', imageSize: '4K' });
    assert.deepEqual(call.body.generationConfig.thinkingConfig, { thinkingLevel: 'MEDIUM' });
    assert.deepEqual(call.body.tools, [{ googleSearch: {} }]);
    assert.equal(call.body.generationConfig.mediaResolution, withReference ? 'MEDIA_RESOLUTION_HIGH' : undefined);
    assert.equal(call.body.contents[0].parts.length, withReference ? 2 : 1);
    if (withReference) assert.deepEqual(call.body.contents[0].parts[0].inlineData, referenceImages[0]);

    const normalized = normalizeNodeDataWithAssets({ ...params, imageUrl, generationInfo: info }, {});
    const saved = createPersistedSnapshot({
      nodes: [{ id: 'result', type: 'imageNode', position: { x: 0, y: 0 }, data: normalized.data }],
      edges: [], assets: normalized.assets,
    }).nodes[0].data;
    assert.equal(saved.imageModel, 'banana-2.1');
    assert.equal(saved.bananaOptions?.thinkingLevel, 'MEDIUM');
    const rerun = buildImageRerunParams(saved, {});
    assert.equal(rerun?.imageModel, 'banana-2.1');
    assert.equal(rerun?.bananaOptions?.thinkingLevel, 'MEDIUM');
    const branch = buildReferenceNodeData({ imageModel: saved.imageModel, bananaOptions: saved.bananaOptions, image2Options: saved.image2Options, referencePayload: { referenceImageIds: ['star'] } });
    assert.equal(branch.imageModel, 'banana-2.1');
    assert.equal(branch.bananaOptions?.thinkingLevel, 'MEDIUM');
  }
});
