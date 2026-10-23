import test from 'node:test';
import assert from 'node:assert/strict';
import { GoogleGenAI } from '@google/genai';
import { createRuntimeConfigManager } from '../runtimeConfig';
import { buildGeminiClientOptions } from './geminiClient';
import { generateBananaImage } from './banana';

const connection = (env: Record<string, string> = {}) => createRuntimeConfigManager(env).get().geminiConnection;
const imageResponse = () => new Response(JSON.stringify({
  candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: 'cG5n' } }] } }],
}), { headers: { 'content-type': 'application/json' } });

test('SDK sends AI Studio and Vertex Express requests to the selected endpoint with separate keys', async (t) => {
  const calls: Array<{ url: string; headers: Headers; body: any }> = [];
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init);
    calls.push({ url: req.url, headers: req.headers, body: await req.json() });
    return imageResponse();
  });
  // Ambient cloud settings must not override an explicit UI selection.
  const saved = process.env.GOOGLE_GENAI_USE_VERTEXAI;
  process.env.GOOGLE_GENAI_USE_VERTEXAI = 'true';
  t.after(() => { if (saved === undefined) delete process.env.GOOGLE_GENAI_USE_VERTEXAI; else process.env.GOOGLE_GENAI_USE_VERTEXAI = saved; });
  for (const [env, expectedUrl, expectedKey] of [
    [{}, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-nano-banana-2.1:generateContent', 'studio-key'],
    [{ GEMINI_BASE_URL: 'https://gateway.example/google/v1beta/' }, 'https://gateway.example/google/v1beta/models/gemini-nano-banana-2.1:generateContent', 'studio-key'],
    [{ GEMINI_PROVIDER: 'vertex-ai' }, 'https://aiplatform.googleapis.com/v1beta1/publishers/google/models/gemini-nano-banana-2.1:generateContent', 'vertex-key'],
    [{ GEMINI_PROVIDER: 'vertex-ai', VERTEX_BASE_URL: 'https://gateway.example/vertex/v1/' }, 'https://gateway.example/vertex/v1/publishers/google/models/gemini-nano-banana-2.1:generateContent', 'vertex-key'],
  ] as const) {
    const result = await generateBananaImage({
      connection: connection({ GEMINI_API_KEY: 'studio-key', VERTEX_API_KEY: 'vertex-key', ...env }),
      imageModel: 'banana-2.1', prompt: 'draw', imageSize: '4K', aspectRatio: '8:1',
      images: [{ data: 'cmVm', mimeType: 'image/png' }],
      bananaOptions: { thinkingLevel: 'MEDIUM', searchGrounding: true },
    });
    assert.equal(result, 'data:image/png;base64,cG5n');
    const call = calls.at(-1)!;
    assert.equal(call.url, expectedUrl);
    assert.equal(call.headers.get('x-goog-api-key'), expectedKey);
    assert.equal(call.headers.has('authorization'), false);
    assert.equal(call.body.contents[0].role, 'user');
    assert.deepEqual(call.body.contents[0].parts[0].inlineData, { data: 'cmVm', mimeType: 'image/png' });
    assert.deepEqual(call.body.generationConfig.imageConfig, { aspectRatio: '8:1', imageSize: '4K' });
    assert.deepEqual(call.body.tools, [{ googleSearch: {} }]);
  }
});

test('standard Vertex uses ADC bearer authentication and project/location resource paths', async (t) => {
  const calls: Request[] = [];
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push(new Request(input, init));
    return imageResponse();
  });
  for (const location of ['global', 'us-central1']) {
    const options = buildGeminiClientOptions(connection({
      GEMINI_PROVIDER: 'vertex-ai', VERTEX_AUTH_MODE: 'adc',
      VERTEX_PROJECT: 'test-project', VERTEX_LOCATION: location,
      GEMINI_API_KEY: 'must-not-be-used', VERTEX_API_KEY: 'also-not-used',
    }));
    assert.equal(options.apiKey, undefined);
    // Supply only the credential provider; the real SDK builds the request and auth headers.
    options.googleAuthOptions = { authClient: {
      getRequestHeaders: async () => new Headers({ authorization: 'Bearer fixture-adc-token' }),
    } as any };
    const ai = new GoogleGenAI(options);
    await ai.models.generateContent({ model: 'gemini-3-pro-image', contents: 'draw' });
    const req = calls.at(-1)!;
    const host = location === 'global' ? 'aiplatform.googleapis.com' : `${location}-aiplatform.googleapis.com`;
    assert.equal(req.url, `https://${host}/v1beta1/projects/test-project/locations/${location}/publishers/google/models/gemini-3-pro-image:generateContent`);
    assert.equal(req.headers.get('authorization'), 'Bearer fixture-adc-token');
    assert.equal(req.headers.has('x-goog-api-key'), false);
  }
});

test('missing selected-provider credentials do not fall back to the other provider', () => {
  assert.throws(() => buildGeminiClientOptions(connection({ VERTEX_API_KEY: 'vertex-key' })), /AI Studio API Key/);
  assert.throws(() => buildGeminiClientOptions(connection({ GEMINI_PROVIDER: 'vertex-ai', GEMINI_API_KEY: 'studio-key' })), /Express Mode API Key/);
  assert.throws(() => buildGeminiClientOptions(connection({ GEMINI_PROVIDER: 'vertex-ai', VERTEX_AUTH_MODE: 'adc' })), /项目 ID/);
});
