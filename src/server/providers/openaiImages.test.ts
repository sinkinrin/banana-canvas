import test from 'node:test';
import { FormData } from 'undici';
import assert from 'node:assert/strict';
import { buildOfficialImageRequest, generateOfficialImage, OfficialImageError, type OfficialImageGenerateInput } from './openaiImages';
import type { OfficialImageConnection } from '../officialImageConfig';
const connection: OfficialImageConnection = { baseUrl: 'https://api.openai.com/v1', apiKey: 'fixture-official', proxyUrl: 'http://127.0.0.1:7890', proxyEnabled: true, stream: false, requestTimeoutMs: 10000, organization: 'org-test', project: 'proj-test' };
const input: OfficialImageGenerateInput = { requestId: 'fixture-request', imageModel: 'openai-image2.6-flare', prompt: 'a blue icon', images: [] };
const png = 'iVBORw0KGgo=';
const encode = new TextEncoder();

test('local edits use image[] multipart and keep markup separate from source pixels', async () => {
  const request = buildOfficialImageRequest({ ...input, images: [{ data: png, mimeType: 'image/png' }], markupImage: { data: png, mimeType: 'image/png' }, officialImageOptions: { quality: 'xhigh', complexity: 'low' } }, connection);
  assert.equal(request.url, 'https://api.openai.com/v1/images/edits');
  assert.ok((request.init.body as unknown) instanceof FormData);
  const form = request.init.body as unknown as FormData;
  assert.equal(form.getAll('image[]').length, 1); assert.ok(form.get('markup') instanceof Blob); assert.equal(form.get('mask'), null);
  assert.equal(form.get('quality'), 'xhigh'); assert.equal(form.get('response_format'), null);
  assert.equal(request.init.headers['OpenAI-Project'], 'proj-test');
});
test('mixed uploaded images, HTTPS URLs and File IDs use official JSON edits', () => {
  const request = buildOfficialImageRequest({ ...input, images: [{ data: png, mimeType: 'image/png' }], officialImageOptions: { imageInputs: [{ file_id: 'file-reference' }, { image_url: 'https://example.com/ref.png' }], mask: { file_id: 'file-mask' } } }, connection);
  const body = JSON.parse(request.init.body as string);
  assert.deepEqual(body.images, [{ image_url: `data:image/png;base64,${png}` }, { file_id: 'file-reference' }, { image_url: 'https://example.com/ref.png' }]);
  assert.deepEqual(body.mask, { file_id: 'file-mask' });
});
test('stream events are decoded incrementally across arbitrary chunks and final metadata is retained', async () => {
  const previews: string[] = [];
  const events = [ { type: 'image_generation.partial_image', b64_json: png, partial_image_index: 0 }, { type: 'image_generation.completed', b64_json: png, output_format: 'png', quality: 'max', size: '1024x1024', usage: { input_tokens: 12, output_tokens: 34, input_tokens_details: { text_tokens: 12 } } } ];
  const stream = new ReadableStream<Uint8Array>({ start(controller) {
    const text = events.map(event => `event: ${event.type}\r\ndata: ${JSON.stringify(event)}\r\n\r\n`).join('');
    for (let i = 0; i < text.length; i += 7) controller.enqueue(encode.encode(text.slice(i, i + 7)));
    controller.close();
  } });
  const result = await generateOfficialImage({ ...input, officialImageOptions: { stream: true, partialImages: 1 }, onPreview: preview => previews.push(preview.imageUrl) }, { connection, fetchImpl: async (_url, init) => {
    assert.equal((init as RequestInit & { dispatcher: { constructor: { name: string } } }).dispatcher.constructor.name, 'ProxyAgent');
    assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer fixture-official');
    return new Response(stream, { headers: { 'content-type': 'text/event-stream', 'x-request-id': 'req-test' } });
  } });
  assert.equal(previews.length, 1); assert.equal(result.imageUrl, previews[0]);
  assert.equal(result.generationInfo?.reportedQuality, 'max'); assert.equal(result.generationInfo?.upstreamRequestId, 'req-test');
  assert.deepEqual(result.generationInfo?.usage?.input_tokens_details, { text_tokens: 12 });
});
test('partial-only and interrupted streams never become successful final images', async () => {
  await assert.rejects(generateOfficialImage({ ...input, officialImageOptions: { stream: true } }, { connection, fetchImpl: async () => new Response(`data: ${JSON.stringify({ type: 'image_edit.partial_image', b64_json: png })}\n\n`, { headers: { 'content-type': 'text/event-stream' } }) }), error => error instanceof OfficialImageError && error.code === 'INCOMPLETE_IMAGE_STREAM');
});
test('all batched images and SVG author usage survive provider decoding', async () => {
  const result = await generateOfficialImage({ ...input, officialImageOptions: { n: 2, outputFormat: 'webp' } }, { connection, fetchImpl: async () => Response.json({ output_format: 'webp', data: [{ b64_json: 'aW1hZ2Ux' }, { b64_json: 'aW1hZ2Uy' }] }) });
  assert.equal(result.images?.length, 2); assert.notEqual(result.images?.[0], result.images?.[1]);
  const svg = await generateOfficialImage({ ...input, officialImageOptions: { outputFormat: 'svg', svgModel: 'svg-author', svgReasoning: 'low' } }, { connection: { ...connection, stream: true }, fetchImpl: async (_url, init) => {
    const body = JSON.parse(init?.body as string); assert.equal(body.stream, false); assert.deepEqual(body.svg, { model: 'svg-author', reasoning: { effort: 'low' } });
    return Response.json({ output_format: 'svg', data: [{ b64_json: 'PHN2Zy8+' }], svg_usage: { model: 'svg-author', input_tokens: 10, output_tokens: 20 } });
  } });
  assert.equal(svg.imageUrl, 'data:image/svg+xml;base64,PHN2Zy8+'); assert.equal(svg.generationInfo?.svgUsage?.model, 'svg-author');
});
test('upstream errors are actionable, redact credentials, and never trigger another network attempt', async () => {
  let calls = 0;
  await assert.rejects(generateOfficialImage(input, { connection, fetchImpl: async () => { calls++; return Response.json({ error: { code: 'moderation_blocked', message: 'fixture-official blocked' } }, { status: 400, headers: { 'x-request-id': 'req-blocked' } }); } }), error => error instanceof OfficialImageError && error.status === 400 && error.code === 'moderation_blocked' && error.upstreamRequestId === 'req-blocked' && !error.message.includes(connection.apiKey));
  assert.equal(calls, 1);
});

test('default GIF sizing delegates the animation pixel budget to the API and default streaming requests a preview', () => {
  const gif = buildOfficialImageRequest({ ...input, officialImageOptions: { outputFormat: 'gif' } }, { ...connection, stream: true });
  const gifBody = JSON.parse(gif.init.body as string);
  assert.equal(gifBody.size, 'auto'); assert.equal(gifBody.stream, false); assert.equal(gifBody.partial_images, undefined);
  const raster = buildOfficialImageRequest(input, { ...connection, stream: true });
  assert.equal(JSON.parse(raster.init.body as string).partial_images, 1);
});
