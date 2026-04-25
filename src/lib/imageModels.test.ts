import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_IMAGE_MODEL,
  buildBananaGenerateContentRequest,
  buildImage2ChatCompletionRequest,
  createImage2MaskEditPrompt,
  buildImage2ImagesRequestBody,
  createImage2Config,
  extractBananaImageUrl,
  extractImage2ImageUrlFromSse,
  getBananaParameterTips,
  getImage2RelayParameterTips,
  getImage2AttemptGroups,
  extractImage2ImageUrl,
  getImage2AttemptChannels,
  getImage2ImagesEndpoint,
  getImageModelConfig,
  isImage2RetriableNetworkError,
  isImage2RetriableHttpStatus,
  normalizeBananaImageSize,
  normalizeBananaOptions,
  normalizeImage2Options,
  normalizeImageModel,
  resolveImage2AllowH2,
  resolveImage2HedgeEnabled,
  resolveImage2ProxyMode,
} from './imageModels';

test('normalizeImageModel falls back to banana for unknown values', () => {
  assert.equal(DEFAULT_IMAGE_MODEL, 'banana');
  assert.equal(normalizeImageModel('image2'), 'image2');
  assert.equal(normalizeImageModel('banana'), 'banana');
  assert.equal(normalizeImageModel('unknown-model'), 'banana');
  assert.equal(normalizeImageModel(undefined), 'banana');
});

test('getImageModelConfig exposes provider metadata for both image models', () => {
  assert.deepEqual(
    {
      id: getImageModelConfig('banana').id,
      provider: getImageModelConfig('banana').provider,
    },
    {
      id: 'banana',
      provider: 'gemini',
    }
  );

  assert.deepEqual(
    {
      id: getImageModelConfig('image2').id,
      provider: getImageModelConfig('image2').provider,
    },
    {
      id: 'image2',
      provider: 'openai-chat',
    }
  );
});

test('normalizeBananaImageSize converts legacy 512px to the official 512 value', () => {
  assert.equal(normalizeBananaImageSize('512px'), '512');
  assert.equal(normalizeBananaImageSize('512'), '512');
  assert.equal(normalizeBananaImageSize('2K'), '2K');
  assert.equal(normalizeBananaImageSize('256'), undefined);
});

test('normalizeBananaOptions keeps only user-tunable Banana2 advanced options', () => {
  assert.deepEqual(
    normalizeBananaOptions({
      responseMode: 'image',
      thinkingLevel: 'medium',
      mediaResolution: 'MEDIA_RESOLUTION_HIGH',
      searchGrounding: true,
      safetySettings: {
        HARM_CATEGORY_HARASSMENT: 'BLOCK_ONLY_HIGH',
        HARM_CATEGORY_HATE_SPEECH: 'BLOCK_NONE',
        HARM_CATEGORY_CIVIC_INTEGRITY: 'BLOCK_NONE',
      },
      outputFormat: 'png',
    }),
    {
      thinkingLevel: 'MEDIUM',
      mediaResolution: 'MEDIA_RESOLUTION_HIGH',
      searchGrounding: true,
    }
  );

  assert.deepEqual(
    normalizeBananaOptions({
      responseMode: 'url',
      thinkingLevel: 'off',
      mediaResolution: 'ULTRA',
      searchGrounding: 'yes',
      safetySettings: {
        HARM_CATEGORY_HARASSMENT: 'ALLOW_ALL',
      },
    }),
    {}
  );
});

test('buildBananaGenerateContentRequest fixes image-only output and disables default safety filtering', () => {
  assert.deepEqual(
    buildBananaGenerateContentRequest({
      prompt: '画一只香蕉机器人',
      aspectRatio: '21:9',
      imageSize: '512px',
      referenceImages: [
        {
          data: 'base64-image',
          mimeType: 'image/webp',
        },
      ],
      bananaOptions: {
        responseMode: 'image',
        thinkingLevel: 'LOW',
        mediaResolution: 'MEDIA_RESOLUTION_HIGH',
        searchGrounding: true,
        safetySettings: {
          HARM_CATEGORY_HARASSMENT: 'BLOCK_ONLY_HIGH',
          HARM_CATEGORY_DANGEROUS_CONTENT: 'OFF',
        },
      },
    }),
    {
      model: 'gemini-3.1-flash-image-preview',
      contents: {
        parts: [
          { inlineData: { data: 'base64-image', mimeType: 'image/webp' } },
          { text: '画一只香蕉机器人' },
        ],
      },
      config: {
        imageConfig: {
          aspectRatio: '21:9',
          imageSize: '512',
        },
        responseModalities: ['IMAGE'],
        thinkingConfig: {
          thinkingLevel: 'LOW',
        },
        mediaResolution: 'MEDIA_RESOLUTION_HIGH',
        tools: [{ googleSearch: {} }],
        safetySettings: [
          {
            category: 'HARM_CATEGORY_HARASSMENT',
            threshold: 'OFF',
          },
          {
            category: 'HARM_CATEGORY_HATE_SPEECH',
            threshold: 'OFF',
          },
          {
            category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
            threshold: 'OFF',
          },
          {
            category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
            threshold: 'OFF',
          },
        ],
      },
    }
  );
});

test('buildBananaGenerateContentRequest omits mediaResolution when there are no reference images', () => {
  const request = buildBananaGenerateContentRequest({
    prompt: '画一只香蕉机器人',
    aspectRatio: '1:1',
    imageSize: '512',
    bananaOptions: {
      mediaResolution: 'MEDIA_RESOLUTION_HIGH',
    },
  });

  assert.equal('mediaResolution' in request.config, false);
});

test('extractBananaImageUrl preserves the returned inline image MIME type', () => {
  assert.equal(
    extractBananaImageUrl({
      candidates: [
        {
          content: {
            parts: [
              {
                inlineData: {
                  mimeType: 'image/jpeg',
                  data: '/9j/base64',
                },
              },
            ],
          },
        },
      ],
    }),
    'data:image/jpeg;base64,/9j/base64'
  );
});

test('extractBananaImageUrl infers the MIME type when Gemini omits inline image MIME metadata', () => {
  assert.equal(
    extractBananaImageUrl({
      candidates: [
        {
          content: {
            parts: [
              {
                inlineData: {
                  data: '/9j/base64',
                },
              },
            ],
          },
        },
      ],
    }),
    'data:image/jpeg;base64,/9j/base64'
  );
});

test('extractBananaImageUrl corrects misleading inline image MIME metadata from Gemini', () => {
  assert.equal(
    extractBananaImageUrl({
      candidates: [
        {
          content: {
            parts: [
              {
                inlineData: {
                  mimeType: 'image/png',
                  data: '/9j/base64',
                },
              },
            ],
          },
        },
      ],
    }),
    'data:image/jpeg;base64,/9j/base64'
  );
});

test('getBananaParameterTips documents Banana2-specific parameter differences', () => {
  const tips = getBananaParameterTips();

  assert.ok(tips.some((tip) => tip.includes('固定仅返回图片')));
  assert.ok(tips.some((tip) => tip.includes('安全过滤固定关闭')));
  assert.ok(tips.some((tip) => tip.includes('transparent')));
  assert.ok(tips.some((tip) => tip.includes('Image2')));
});

test('buildImage2ChatCompletionRequest sends prompt and references as multimodal chat content', () => {
  const body = buildImage2ChatCompletionRequest({
    model: 'image2',
    prompt: '画一只香蕉机器人',
    referenceImages: [
      {
        data: 'base64-image',
        mimeType: 'image/png',
      },
    ],
  });

  assert.equal(body.model, 'image2');
  assert.equal(body.messages.length, 1);
  assert.equal(body.messages[0].role, 'user');
  assert.deepEqual(body.messages[0].content, [
    { type: 'text', text: '画一只香蕉机器人' },
    { type: 'image_url', image_url: { url: 'data:image/png;base64,base64-image' } },
  ]);
});

test('createImage2MaskEditPrompt constrains edits to transparent mask areas', () => {
  const prompt = createImage2MaskEditPrompt('把帽子改成红色');

  assert.match(prompt, /transparent pixels/);
  assert.match(prompt, /Preserve all unmasked/);
  assert.match(prompt, /把帽子改成红色/);
});

test('buildImage2ImagesRequestBody keeps the original prompt and size separate', () => {
  assert.deepEqual(
    buildImage2ImagesRequestBody({
      model: 'gpt-image-2',
      prompt: '一只香蕉在太空',
      size: '1024x1024',
    }),
    {
      model: 'gpt-image-2',
      prompt: '一只香蕉在太空',
      size: '1024x1024',
      background: 'opaque',
      moderation: 'low',
    }
  );
});

test('buildImage2ImagesRequestBody can request streaming partial image events', () => {
  assert.deepEqual(
    buildImage2ImagesRequestBody({
      model: 'gpt-image-2',
      prompt: '一只香蕉在太空',
      size: '1024x1024',
      stream: true,
      partialImages: 1,
    }),
    {
      model: 'gpt-image-2',
      prompt: '一只香蕉在太空',
      size: '1024x1024',
      background: 'opaque',
      moderation: 'low',
      stream: true,
      partial_images: 1,
    }
  );
});

test('normalizeImage2Options keeps only user-tunable gpt-image-2 parameters', () => {
  assert.deepEqual(
    normalizeImage2Options({
      quality: 'high',
      background: 'transparent',
      outputFormat: 'webp',
      outputCompression: 160,
      moderation: 'low',
      responseFormat: 'url',
      stream: 'on',
      partialImages: 9,
      inputFidelity: 'high',
      n: 4,
      style: 'vivid',
      user: 'end-user-1',
    }),
    {
      quality: 'high',
      outputFormat: 'webp',
      outputCompression: 100,
      responseFormat: 'url',
      partialImages: 3,
    }
  );

  assert.deepEqual(
    normalizeImage2Options({
      quality: 'ultra',
      background: 'checkerboard',
      outputFormat: 'gif',
      outputCompression: '80',
      moderation: 'strict',
      responseFormat: 'remote_url',
      stream: true,
      partialImages: -1,
      inputFidelity: 'auto',
    }),
    {}
  );
});

test('normalizeImage2Options drops transparent background requests for gpt-image-2', () => {
  assert.deepEqual(
    normalizeImage2Options({
      background: 'transparent',
      outputFormat: 'jpeg',
      outputCompression: 80,
    }),
    {
      outputFormat: 'jpeg',
      outputCompression: 80,
    }
  );
});

test('normalizeImage2Options ignores fixed background, moderation and stream overrides', () => {
  assert.deepEqual(
    normalizeImage2Options({
      background: 'opaque',
      moderation: 'auto',
      stream: 'off',
      quality: 'medium',
    }),
    {
      quality: 'medium',
    }
  );
});

test('buildImage2ImagesRequestBody maps image2 options to supported Images API fields', () => {
  assert.deepEqual(
    buildImage2ImagesRequestBody({
      model: 'gpt-image-2',
      prompt: '一只香蕉在太空',
      size: '1024x1024',
      stream: true,
      partialImages: 0,
      image2Options: {
        quality: 'medium',
        background: 'opaque',
        outputFormat: 'jpeg',
        outputCompression: 72,
        moderation: 'low',
        responseFormat: 'url',
        inputFidelity: 'high',
      },
    }),
    {
      model: 'gpt-image-2',
      prompt: '一只香蕉在太空',
      size: '1024x1024',
      stream: true,
      partial_images: 0,
      quality: 'medium',
      background: 'opaque',
      output_format: 'jpeg',
      output_compression: 72,
      moderation: 'low',
      response_format: 'url',
    }
  );
});

test('getImage2RelayParameterTips documents relay-specific parameter differences', () => {
  const tips = getImage2RelayParameterTips();

  assert.ok(tips.some((tip) => tip.includes('n')));
  assert.ok(tips.some((tip) => tip.includes('data URL')));
  assert.ok(tips.some((tip) => tip.includes('file_id')));
  assert.ok(tips.some((tip) => tip.includes('背景固定 opaque')));
  assert.ok(tips.some((tip) => tip.includes('stream 跟随 .env')));
  assert.ok(tips.some((tip) => tip.includes('input_fidelity')));
});

test('extractImage2ImageUrlFromSse prefers the final image over partial images', () => {
  const imageUrl = extractImage2ImageUrlFromSse([
    'event: image_generation.partial_image',
    'data: {"type":"image_generation.partial_image","partial_image_index":0,"b64_json":"partial-base64"}',
    '',
    'event: image_generation.completed',
    'data: {"type":"image_generation.completed","b64_json":"final-base64"}',
    '',
    'data: [DONE]',
    '',
  ].join('\n'));

  assert.equal(imageUrl, 'data:image/png;base64,final-base64');
});

test('createImage2Config reads relay settings from environment values', () => {
  assert.deepEqual(
    createImage2Config({
      IMAGE2_BASE_URL: 'https://relay.example/v1',
      IMAGE2_API_KEY: 'relay-key',
      IMAGE2_MODEL: 'gpt-image-2',
    }),
    {
      baseUrl: 'https://relay.example/v1',
      apiKey: 'relay-key',
      model: 'gpt-image-2',
      endpointType: 'images',
      missingKeys: [],
    }
  );
});

test('createImage2Config normalizes base URLs with nested endpoint paths', () => {
  assert.equal(
    createImage2Config({
      IMAGE2_BASE_URL: 'https://relay.example/v1/chat/completions/',
      IMAGE2_API_KEY: 'relay-key',
      IMAGE2_MODEL: 'gpt-image-2',
    }).baseUrl,
    'https://relay.example/v1'
  );
});

test('createImage2Config appends v1 for bare relay origins', () => {
  assert.equal(
    createImage2Config({
      IMAGE2_BASE_URL: 'https://relay.example',
      IMAGE2_API_KEY: 'relay-key',
      IMAGE2_MODEL: 'gpt-image-2',
    }).baseUrl,
    'https://relay.example/v1'
  );
});

test('createImage2Config supports legacy chat completions URL as a base URL source', () => {
  assert.equal(
    createImage2Config({
      IMAGE2_CHAT_COMPLETIONS_URL: 'https://relay.example/v1/chat/completions',
      IMAGE2_API_KEY: 'relay-key',
      IMAGE2_MODEL: 'gpt-image-2',
    }).baseUrl,
    'https://relay.example/v1'
  );
});

test('createImage2Config defaults non-image models to chat completions', () => {
  assert.equal(
    createImage2Config({
      IMAGE2_BASE_URL: 'https://relay.example/v1',
      IMAGE2_API_KEY: 'relay-key',
      IMAGE2_MODEL: 'custom-vision-chat',
    }).endpointType,
    'chat'
  );
});

test('createImage2Config allows endpoint type override from environment', () => {
  assert.equal(
    createImage2Config({
      IMAGE2_BASE_URL: 'https://relay.example/v1',
      IMAGE2_API_KEY: 'relay-key',
      IMAGE2_MODEL: 'gpt-image-2',
      IMAGE2_ENDPOINT_TYPE: 'chat',
    }).endpointType,
    'chat'
  );
});

test('createImage2Config reports missing environment values', () => {
  assert.deepEqual(
    createImage2Config({
      IMAGE2_BASE_URL: ' ',
      IMAGE2_MODEL: 'gpt-image-2',
    }),
    {
      baseUrl: '',
      apiKey: '',
      model: 'gpt-image-2',
      endpointType: 'images',
      missingKeys: ['IMAGE2_BASE_URL', 'IMAGE2_API_KEY'],
    }
  );
});

test('getImage2ImagesEndpoint derives generation and edit endpoints from a base URL', () => {
  assert.equal(
    getImage2ImagesEndpoint('https://relay.example/v1', false),
    'https://relay.example/v1/images/generations'
  );
  assert.equal(
    getImage2ImagesEndpoint('https://relay.example/v1/', true),
    'https://relay.example/v1/images/edits'
  );
});

test('extractImage2ImageUrl reads data urls from string chat content', () => {
  assert.equal(
    extractImage2ImageUrl({
      choices: [
        {
          message: {
            content: '生成完成：![image](data:image/png;base64,abc123)',
          },
        },
      ],
    }),
    'data:image/png;base64,abc123'
  );
});

test('extractImage2ImageUrl reads image_url parts from array chat content', () => {
  assert.equal(
    extractImage2ImageUrl({
      choices: [
        {
          message: {
            content: [
              { type: 'text', text: '生成完成' },
              { type: 'image_url', image_url: { url: 'https://example.com/generated.png' } },
            ],
          },
        },
      ],
    }),
    'https://example.com/generated.png'
  );
});

test('getImage2ImagesEndpoint derives generation and edit endpoints from a v1 URL', () => {
  assert.equal(
    getImage2ImagesEndpoint('http://154.50.110.210:8317/v1/chat/completions', false),
    'http://154.50.110.210:8317/v1/images/generations'
  );
  assert.equal(
    getImage2ImagesEndpoint('http://154.50.110.210:8317/v1/chat/completions', true),
    'http://154.50.110.210:8317/v1/images/edits'
  );
});

test('extractImage2ImageUrl reads b64_json from images API responses', () => {
  assert.equal(
    extractImage2ImageUrl({
      data: [
        {
          b64_json: 'abc123',
        },
      ],
    }),
    'data:image/png;base64,abc123'
  );
});

test('extractImage2ImageUrl infers the MIME type for base64 image payloads', () => {
  assert.equal(
    extractImage2ImageUrl({ b64_json: '/9j/4AAQSkZJRgABAQAAAQABAAD' }),
    'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD'
  );

  assert.equal(
    extractImage2ImageUrl({ b64_json: 'UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+' }),
    'data:image/webp;base64,UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+'
  );
});

test('extractImage2ImageUrl reads url from images API responses', () => {
  assert.equal(
    extractImage2ImageUrl({
      data: [
        {
          url: 'https://example.com/generated.png',
        },
      ],
    }),
    'https://example.com/generated.png'
  );
});

test('isImage2RetriableNetworkError identifies TLS connection resets from fetch', () => {
  const error = new TypeError('fetch failed');
  Object.assign(error, {
    cause: {
      code: 'ECONNRESET',
      message: 'Client network socket disconnected before secure TLS connection was established',
    },
  });

  assert.equal(isImage2RetriableNetworkError(error), true);
});

test('isImage2RetriableNetworkError identifies undici proxy connection failures', () => {
  const connectTimeout = new TypeError('fetch failed');
  Object.assign(connectTimeout, {
    cause: {
      code: 'UND_ERR_CONNECT_TIMEOUT',
      message: 'Connect Timeout Error',
    },
  });

  const socketClosed = new TypeError('terminated');
  Object.assign(socketClosed, {
    cause: {
      code: 'UND_ERR_SOCKET',
      message: 'other side closed',
    },
  });

  assert.equal(isImage2RetriableNetworkError(connectTimeout), true);
  assert.equal(isImage2RetriableNetworkError(socketClosed), true);
});

test('isImage2RetriableNetworkError identifies request timeouts', () => {
  assert.equal(isImage2RetriableNetworkError(new DOMException('timed out', 'TimeoutError')), true);
});

test('isImage2RetriableNetworkError ignores HTTP response errors', () => {
  assert.equal(isImage2RetriableNetworkError(new Error('image2 请求失败 (504): Gateway Time-out')), false);
});

test('isImage2RetriableHttpStatus retries gateway failures only', () => {
  assert.equal(isImage2RetriableHttpStatus(502), true);
  assert.equal(isImage2RetriableHttpStatus(503), true);
  assert.equal(isImage2RetriableHttpStatus(504), true);
  assert.equal(isImage2RetriableHttpStatus(400), false);
  assert.equal(isImage2RetriableHttpStatus(401), false);
});

test('resolveImage2ProxyMode reuses the shared proxy by default when configured', () => {
  assert.equal(resolveImage2ProxyMode(undefined, true), 'direct');
  assert.equal(resolveImage2ProxyMode(undefined, false), 'direct');
});

test('resolveImage2ProxyMode accepts explicit direct, auto, and proxy modes', () => {
  assert.equal(resolveImage2ProxyMode('direct', true), 'direct');
  assert.equal(resolveImage2ProxyMode('auto', true), 'auto');
  assert.equal(resolveImage2ProxyMode('proxy', false), 'proxy');
  assert.equal(resolveImage2ProxyMode('unknown', true), 'direct');
});

test('resolveImage2HedgeEnabled is disabled unless explicitly enabled', () => {
  assert.equal(resolveImage2HedgeEnabled(undefined), false);
  assert.equal(resolveImage2HedgeEnabled('false'), false);
  assert.equal(resolveImage2HedgeEnabled('0'), false);
  assert.equal(resolveImage2HedgeEnabled('true'), true);
  assert.equal(resolveImage2HedgeEnabled('1'), true);
});

test('resolveImage2AllowH2 is enabled unless explicitly disabled', () => {
  assert.equal(resolveImage2AllowH2(undefined), true);
  assert.equal(resolveImage2AllowH2('true'), true);
  assert.equal(resolveImage2AllowH2('1'), true);
  assert.equal(resolveImage2AllowH2('false'), false);
  assert.equal(resolveImage2AllowH2('0'), false);
});

test('getImage2AttemptChannels alternates proxy and direct when proxy mode is enabled', () => {
  assert.deepEqual(getImage2AttemptChannels('proxy', true, 4), ['proxy', 'direct', 'proxy', 'direct']);
});

test('getImage2AttemptChannels starts with direct in auto mode', () => {
  assert.deepEqual(getImage2AttemptChannels('auto', true, 4), ['direct', 'proxy', 'direct', 'proxy']);
});

test('getImage2AttemptChannels uses direct only when there is no proxy', () => {
  assert.deepEqual(getImage2AttemptChannels('proxy', false, 3), ['direct', 'direct', 'direct']);
});

test('getImage2AttemptGroups races proxy and direct in proxy mode', () => {
  assert.deepEqual(getImage2AttemptGroups('proxy', true, 4), [
    ['proxy', 'direct'],
    ['proxy', 'direct'],
  ]);
});

test('getImage2AttemptGroups races direct and proxy in auto mode', () => {
  assert.deepEqual(getImage2AttemptGroups('auto', true, 4), [
    ['direct', 'proxy'],
    ['direct', 'proxy'],
  ]);
});

test('getImage2AttemptGroups uses single direct attempts without a proxy', () => {
  assert.deepEqual(getImage2AttemptGroups('proxy', false, 3), [
    ['direct'],
    ['direct'],
    ['direct'],
  ]);
});
