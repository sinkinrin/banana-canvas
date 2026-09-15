import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { createGenerateImagePayload, getGenerateImageTimeoutMs } from '../services/gemini';
import { mountGenerationRoutes } from './generationRoutes';
import { createRuntimeConfigManager } from './runtimeConfig';
import { generateImage2Image } from './providers/image2';

test('Image 2.5 client-to-provider routing preserves variants, transparency, references and masks', async () => {
  const calls: Array<{ url: string; contentType: string; body: string }> = [];
  const relay = http.createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    calls.push({ url: req.url!, contentType: req.headers['content-type'] ?? '', body: Buffer.concat(chunks).toString() });
    assert.equal(req.headers.authorization, 'Bearer fixture-key');
    // The live relay can return final JSON even with an SSE content type.
    res.setHeader('content-type', 'text/event-stream');
    res.end(JSON.stringify({ data: [{ b64_json: 'iVBORw0KGgo=' }] }));
  });
  relay.listen(0, '127.0.0.1');
  await once(relay, 'listening');
  const config = createRuntimeConfigManager({
    IMAGE2_BASE_URL: `http://127.0.0.1:${(relay.address() as AddressInfo).port}/v1`,
    IMAGE2_API_KEY: 'fixture-key', IMAGE2_MODEL: 'legacy-custom-model', IMAGE2_ENDPOINT_TYPE: 'chat',
    IMAGE2_STREAM: 'true', IMAGE2_PROXY_MODE: 'direct', IMAGE2_MAX_ATTEMPTS: '1',
  });
  const app = express();
  app.use(express.json());
  mountGenerationRoutes(app, { runtimeConfig: config, providers: {
    generateBananaImage: async () => { throw new Error('Wrong provider'); },
    generateImage2Image: (input) => generateImage2Image({ ...input, runtimeConfig: config }),
  } });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    for (const variant of ['flare', 'sunburst'] as const) {
      const imageModel = `image2.5-${variant}` as const;
      assert.equal(getGenerateImageTimeoutMs(imageModel), 300_000);
      for (const edit of [false, true]) {
        const payload = createGenerateImagePayload({
          prompt: 'blue star', imageModel, image2Options: { background: 'transparent', outputFormat: 'jpeg', outputCompression: 75, quality: 'high' },
          ...(edit ? { referenceImages: [{ data: 'c3Rhcg==', mimeType: 'image/png' }], maskImage: { data: 'bWFzaw==', mimeType: 'image/png' as const } } : {}),
        });
        const result = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/generate-image`, {
          method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
        });
        assert.equal(result.status, 200);
        assert.deepEqual(await result.json(), { imageModel, imageUrl: 'data:image/png;base64,iVBORw0KGgo=' });
        const call = calls.at(-1)!;
        assert.equal(call.url, `/v1/images/${edit ? 'edits' : 'generations'}`);
        if (edit) {
          assert.match(call.contentType, /multipart\/form-data/);
          for (const [field, value] of Object.entries({ model: `gpt-image-2.5-${variant}`, background: 'transparent', output_format: 'png', quality: 'high' })) {
            assert.ok(call.body.includes(`name="${field}"\r\n\r\n${value}\r\n`), field);
          }
          assert.match(call.body, /name="mask"/);
          assert.match(call.body, /name="image"/);
          assert.doesNotMatch(call.body, /name="output_compression"/);
        } else {
          const body = JSON.parse(call.body);
          assert.equal(body.model, `gpt-image-2.5-${variant}`);
          assert.equal(body.background, 'transparent');
          assert.equal(body.output_format, 'png');
          assert.equal(body.stream, true);
          assert.equal(body.output_compression, undefined);
        }
      }
    }
    assert.equal(calls.length, 4);
  } finally {
    await Promise.all([server, relay].map((listener) => new Promise<void>((resolve, reject) => {
      listener.close((error) => error ? reject(error) : resolve());
      listener.closeAllConnections();
    })));
  }
});
