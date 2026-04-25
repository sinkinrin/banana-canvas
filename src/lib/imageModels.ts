export const DEFAULT_IMAGE_MODEL = 'banana';

export const IMAGE_MODELS = [
  {
    id: 'banana',
    label: 'Banana',
    description: 'Gemini image preview model',
    provider: 'gemini',
  },
  {
    id: 'image2',
    label: 'Image2',
    description: 'OpenAI-compatible relay model',
    provider: 'openai-chat',
  },
] as const;

export type ImageModelId = (typeof IMAGE_MODELS)[number]['id'];

export type ReferenceImageInput = {
  data: string;
  mimeType: string;
};

export const BANANA_MODEL = 'gemini-3.1-flash-image-preview';
export const BANANA_ASPECT_RATIO_VALUES = [
  '1:1',
  '1:4',
  '1:8',
  '2:3',
  '3:2',
  '3:4',
  '4:1',
  '4:3',
  '4:5',
  '5:4',
  '8:1',
  '9:16',
  '16:9',
  '21:9',
] as const;
export const BANANA_IMAGE_SIZE_VALUES = ['512', '1K', '2K', '4K'] as const;
export const BANANA_RESPONSE_MODE_VALUES = ['image', 'text-image'] as const;
export const BANANA_THINKING_LEVEL_VALUES = ['MINIMAL', 'LOW', 'MEDIUM', 'HIGH'] as const;
export const BANANA_MEDIA_RESOLUTION_VALUES = [
  'MEDIA_RESOLUTION_LOW',
  'MEDIA_RESOLUTION_MEDIUM',
  'MEDIA_RESOLUTION_HIGH',
] as const;
export const BANANA_SAFETY_CATEGORIES = [
  'HARM_CATEGORY_HARASSMENT',
  'HARM_CATEGORY_HATE_SPEECH',
  'HARM_CATEGORY_SEXUALLY_EXPLICIT',
  'HARM_CATEGORY_DANGEROUS_CONTENT',
] as const;
export const BANANA_SAFETY_THRESHOLDS = [
  'BLOCK_LOW_AND_ABOVE',
  'BLOCK_MEDIUM_AND_ABOVE',
  'BLOCK_ONLY_HIGH',
  'BLOCK_NONE',
  'OFF',
] as const;

export type BananaAspectRatio = (typeof BANANA_ASPECT_RATIO_VALUES)[number];
export type BananaImageSize = (typeof BANANA_IMAGE_SIZE_VALUES)[number];
export type BananaResponseMode = (typeof BANANA_RESPONSE_MODE_VALUES)[number];
export type BananaThinkingLevel = (typeof BANANA_THINKING_LEVEL_VALUES)[number];
export type BananaMediaResolution = (typeof BANANA_MEDIA_RESOLUTION_VALUES)[number];
export type BananaSafetyCategory = (typeof BANANA_SAFETY_CATEGORIES)[number];
export type BananaSafetyThreshold = (typeof BANANA_SAFETY_THRESHOLDS)[number];

export type BananaOptions = {
  responseMode?: BananaResponseMode;
  thinkingLevel?: BananaThinkingLevel;
  mediaResolution?: BananaMediaResolution;
  searchGrounding?: true;
  safetySettings?: Partial<Record<BananaSafetyCategory, BananaSafetyThreshold>>;
};

export const BANANA_DEFAULT_SAFETY_SETTINGS = BANANA_SAFETY_CATEGORIES.map((category) => ({
  category,
  threshold: 'OFF' as const,
}));

export const IMAGE2_QUALITY_VALUES = ['auto', 'low', 'medium', 'high'] as const;
export const IMAGE2_BACKGROUND_VALUES = ['auto', 'opaque', 'transparent'] as const;
export const IMAGE2_OUTPUT_FORMAT_VALUES = ['png', 'jpeg', 'webp'] as const;
export const IMAGE2_MODERATION_VALUES = ['auto', 'low'] as const;
export const IMAGE2_RESPONSE_FORMAT_VALUES = ['b64_json', 'url'] as const;
export const IMAGE2_STREAM_VALUES = ['server', 'on', 'off'] as const;
export const IMAGE2_INPUT_FIDELITY_VALUES = ['low', 'high'] as const;
export const IMAGE2_FIXED_BACKGROUND: Image2Background = 'opaque';
export const IMAGE2_FIXED_MODERATION: Image2Moderation = 'low';

export type Image2Quality = (typeof IMAGE2_QUALITY_VALUES)[number];
export type Image2Background = (typeof IMAGE2_BACKGROUND_VALUES)[number];
export type Image2OutputFormat = (typeof IMAGE2_OUTPUT_FORMAT_VALUES)[number];
export type Image2Moderation = (typeof IMAGE2_MODERATION_VALUES)[number];
export type Image2ResponseFormat = (typeof IMAGE2_RESPONSE_FORMAT_VALUES)[number];
export type Image2StreamMode = (typeof IMAGE2_STREAM_VALUES)[number];
export type Image2InputFidelity = (typeof IMAGE2_INPUT_FIDELITY_VALUES)[number];

export type Image2Options = {
  quality?: Image2Quality;
  background?: Image2Background;
  outputFormat?: Image2OutputFormat;
  outputCompression?: number;
  moderation?: Image2Moderation;
  responseFormat?: Image2ResponseFormat;
  stream?: Image2StreamMode;
  partialImages?: number;
  inputFidelity?: Image2InputFidelity;
};

export type Image2ChatContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export type Image2ChatCompletionRequest = {
  model: string;
  messages: Array<{
    role: 'user';
    content: Image2ChatContentPart[];
  }>;
};

export type Image2ImagesRequestBody = {
  model: string;
  prompt: string;
  size: string;
  quality?: Image2Quality;
  background?: Image2Background;
  output_format?: Image2OutputFormat;
  output_compression?: number;
  moderation?: Image2Moderation;
  response_format?: Image2ResponseFormat;
  stream?: true;
  partial_images?: number;
};

type ImageModelConfig = (typeof IMAGE_MODELS)[number];

type UnknownRecord = Record<string, unknown>;
type Image2Env = Record<string, string | undefined>;
export type Image2EndpointType = 'chat' | 'images';
export type Image2ProxyMode = 'direct' | 'auto' | 'proxy';
export type Image2AttemptChannel = 'direct' | 'proxy';

export type Image2Config = {
  baseUrl: string;
  apiKey: string;
  model: string;
  endpointType: Image2EndpointType;
  missingKeys: string[];
};

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeStringValue<T extends readonly string[]>(
  value: unknown,
  values: T
): T[number] | undefined {
  return typeof value === 'string' && (values as readonly string[]).includes(value)
    ? value as T[number]
    : undefined;
}

function normalizeStringOption<T extends readonly string[]>(
  record: UnknownRecord,
  key: string,
  values: T
): T[number] | undefined {
  return normalizeStringValue(record[key], values);
}

function getOptionValue(record: UnknownRecord, camelKey: string, snakeKey: string) {
  return record[camelKey] ?? record[snakeKey];
}

function normalizeBoundedInteger(value: unknown, min: number, max: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  if (value < min) return undefined;
  return Math.min(max, Math.trunc(value));
}

export function normalizeBananaAspectRatio(value: unknown): BananaAspectRatio | undefined {
  return normalizeStringValue(value, BANANA_ASPECT_RATIO_VALUES);
}

export function normalizeBananaImageSize(value: unknown): BananaImageSize | undefined {
  if (value === '512px') return '512';
  return normalizeStringValue(value, BANANA_IMAGE_SIZE_VALUES);
}

function normalizeBananaThinkingLevel(value: unknown): BananaThinkingLevel | undefined {
  const direct = normalizeStringValue(value, BANANA_THINKING_LEVEL_VALUES);
  if (direct) return direct;
  if (typeof value !== 'string') return undefined;

  return normalizeStringValue(value.toUpperCase(), BANANA_THINKING_LEVEL_VALUES);
}

export function normalizeBananaOptions(value: unknown): BananaOptions {
  if (!isRecord(value)) return {};

  const options: BananaOptions = {};
  const thinkingLevel =
    normalizeBananaThinkingLevel(value.thinkingLevel) ??
    normalizeBananaThinkingLevel(value.thinking_level);
  const mediaResolution =
    normalizeStringOption(value, 'mediaResolution', BANANA_MEDIA_RESOLUTION_VALUES) ??
    normalizeStringOption(value, 'media_resolution', BANANA_MEDIA_RESOLUTION_VALUES);
  const searchGroundingValue = value.searchGrounding ?? value.search_grounding;

  if (thinkingLevel) options.thinkingLevel = thinkingLevel;
  if (mediaResolution) options.mediaResolution = mediaResolution;
  if (searchGroundingValue === true) options.searchGrounding = true;

  return options;
}

export function buildBananaGenerateContentRequest({
  prompt,
  aspectRatio,
  imageSize,
  referenceImages = [],
  bananaOptions,
}: {
  prompt: string;
  aspectRatio?: unknown;
  imageSize?: unknown;
  referenceImages?: ReferenceImageInput[];
  bananaOptions?: BananaOptions;
}) {
  const options = normalizeBananaOptions(bananaOptions);
  const hasReferenceImages = referenceImages.length > 0;
  const parts = [
    ...referenceImages.map((image) => ({
      inlineData: {
        data: image.data,
        mimeType: image.mimeType,
      },
    })),
    { text: prompt },
  ];
  const config: UnknownRecord = {
    imageConfig: {
      aspectRatio: normalizeBananaAspectRatio(aspectRatio) ?? '1:1',
      imageSize: normalizeBananaImageSize(imageSize) ?? '1K',
    },
    responseModalities: ['IMAGE'],
    safetySettings: BANANA_DEFAULT_SAFETY_SETTINGS,
  };

  if (options.thinkingLevel) {
    config.thinkingConfig = {
      thinkingLevel: options.thinkingLevel,
    };
  }

  if (options.mediaResolution && hasReferenceImages) {
    config.mediaResolution = options.mediaResolution;
  }

  if (options.searchGrounding) {
    config.tools = [{ googleSearch: {} }];
  }

  return {
    model: BANANA_MODEL,
    contents: { parts },
    config,
  };
}

function getInlineImageData(part: unknown): { data: string; mimeType: string } | null {
  if (!isRecord(part)) return null;

  const inlineData = isRecord(part.inlineData)
    ? part.inlineData
    : isRecord(part.inline_data)
      ? part.inline_data
      : null;
  if (!inlineData || typeof inlineData.data !== 'string') return null;

  const explicitMimeType =
    typeof inlineData.mimeType === 'string'
      ? inlineData.mimeType
      : typeof inlineData.mime_type === 'string'
        ? inlineData.mime_type
        : undefined;

  const knownMimeType = inferKnownImageMimeTypeFromBase64(inlineData.data);

  return {
    data: inlineData.data,
    mimeType: knownMimeType ?? explicitMimeType ?? 'image/png',
  };
}

export function extractBananaImageUrl(response: unknown): string | null {
  if (!isRecord(response)) return null;

  const topLevelParts = Array.isArray(response.parts) ? response.parts : [];
  for (const part of topLevelParts) {
    const image = getInlineImageData(part);
    if (image) return `data:${image.mimeType};base64,${image.data}`;
  }

  const candidates = Array.isArray(response.candidates) ? response.candidates : [];
  for (const candidate of candidates) {
    if (!isRecord(candidate) || !isRecord(candidate.content)) continue;
    const parts = Array.isArray(candidate.content.parts) ? candidate.content.parts : [];
    for (const part of parts) {
      const image = getInlineImageData(part);
      if (image) return `data:${image.mimeType};base64,${image.data}`;
    }
  }

  return null;
}

export function getBananaParameterTips() {
  return [
    '输出类型固定仅返回图片，避免 Gemini 返回文本 part 但本项目最终不消费。',
    'thinkingLevel、mediaResolution、Google Search grounding 会增加延迟或成本；复杂构图、含文字、需要实时资料时再开启。',
    '安全过滤固定关闭：骚扰、仇恨、色情、危险四类 safetySettings 默认发送 OFF，不在前端开放调节。',
    'Banana2 没有 Image2 的 output_format、transparent background、压缩、partial_images、mask 参数；透明背景只能写进提示词尝试。',
  ];
}

export function normalizeImage2Options(value: unknown): Image2Options {
  if (!isRecord(value)) return {};

  const options: Image2Options = {};
  const quality = normalizeStringOption(value, 'quality', IMAGE2_QUALITY_VALUES);
  const outputFormat =
    normalizeStringOption(value, 'outputFormat', IMAGE2_OUTPUT_FORMAT_VALUES) ??
    normalizeStringOption(value, 'output_format', IMAGE2_OUTPUT_FORMAT_VALUES);
  const responseFormat =
    normalizeStringOption(value, 'responseFormat', IMAGE2_RESPONSE_FORMAT_VALUES) ??
    normalizeStringOption(value, 'response_format', IMAGE2_RESPONSE_FORMAT_VALUES);
  const outputCompression = normalizeBoundedInteger(
    getOptionValue(value, 'outputCompression', 'output_compression'),
    0,
    100
  );
  const partialImages = normalizeBoundedInteger(
    getOptionValue(value, 'partialImages', 'partial_images'),
    0,
    3
  );

  if (quality) options.quality = quality;
  if (outputFormat) options.outputFormat = outputFormat;
  if (responseFormat) options.responseFormat = responseFormat;
  if (typeof partialImages === 'number') options.partialImages = partialImages;

  if (
    typeof outputCompression === 'number' &&
    (options.outputFormat === 'jpeg' || options.outputFormat === 'webp')
  ) {
    options.outputCompression = outputCompression;
  }

  return options;
}

export function getImage2RelayParameterTips() {
  return [
    '前端只开放 quality、output_format、output_compression、response_format、partial_images；背景固定 opaque，审核强度固定 low，stream 跟随 .env。',
    'gpt-image-2 不支持 transparent background；本项目不提供透明背景选择。',
    'input_fidelity 对 gpt-image-2 不可调，官方要求省略；该模型会自动用高保真处理输入图。',
    'n、style、user 当前会被 CLIProxyAPI 忽略；多图请使用本项目的生成数量，它会发起多次请求。',
    'response_format=url 在 CLIProxyAPI 中返回 data URL，不是官方 60 分钟临时 URL。',
    '编辑图的 file_id 不支持；本项目用上传/粘贴参考图走 multipart image，并提供参考图和生成图的 mask 局部编辑 UI。',
  ];
}

export function createImage2MaskEditPrompt(prompt: string) {
  return [
    'Only edit the area indicated by the fully transparent pixels in the uploaded mask.',
    'Preserve all unmasked areas of the input image as closely as possible, including composition, camera, lighting, colors, identity, and texture.',
    `User edit request: ${prompt}`,
  ].join('\n');
}

export function isImageModelId(value: unknown): value is ImageModelId {
  return typeof value === 'string' && IMAGE_MODELS.some((model) => model.id === value);
}

export function normalizeImageModel(value: unknown): ImageModelId {
  return isImageModelId(value) ? value : DEFAULT_IMAGE_MODEL;
}

export function getImageModelConfig(model: unknown): ImageModelConfig {
  const modelId = normalizeImageModel(model);
  return IMAGE_MODELS.find((config) => config.id === modelId) ?? IMAGE_MODELS[0];
}

function inferImage2EndpointType(model: string): Image2EndpointType {
  return model.toLowerCase().startsWith('gpt-image') ? 'images' : 'chat';
}

function normalizeImage2EndpointType(value: string | undefined, model: string): Image2EndpointType {
  const normalized = value?.trim().toLowerCase();
  if (normalized === 'chat' || normalized === 'images') return normalized;
  return inferImage2EndpointType(model);
}

export function normalizeImage2BaseUrl(baseUrl: string) {
  const normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, '');
  const v1Match = normalizedBaseUrl.match(/^(.*\/v1)(?:\/.*)?$/);
  if (v1Match) return v1Match[1];

  try {
    const url = new URL(normalizedBaseUrl);
    if (url.pathname === '' || url.pathname === '/') {
      return `${url.origin}/v1`;
    }
  } catch {
    return normalizedBaseUrl;
  }

  return normalizedBaseUrl;
}

export function createImage2Config(env: Image2Env): Image2Config {
  const rawBaseUrl = env.IMAGE2_BASE_URL?.trim() || env.IMAGE2_CHAT_COMPLETIONS_URL?.trim() || '';
  const baseUrl = rawBaseUrl ? normalizeImage2BaseUrl(rawBaseUrl) : '';
  const apiKey = env.IMAGE2_API_KEY?.trim() ?? '';
  const model = env.IMAGE2_MODEL?.trim() ?? '';
  const endpointType = normalizeImage2EndpointType(env.IMAGE2_ENDPOINT_TYPE, model);
  const missingKeys = [
    baseUrl ? null : 'IMAGE2_BASE_URL',
    apiKey ? null : 'IMAGE2_API_KEY',
    model ? null : 'IMAGE2_MODEL',
  ].filter((key): key is string => Boolean(key));

  return {
    baseUrl,
    apiKey,
    model,
    endpointType,
    missingKeys,
  };
}

export function getImage2ChatCompletionsEndpoint(baseUrl: string) {
  return `${normalizeImage2BaseUrl(baseUrl)}/chat/completions`;
}

export function buildImage2ChatCompletionRequest({
  model,
  prompt,
  referenceImages = [],
}: {
  model: string;
  prompt: string;
  referenceImages?: ReferenceImageInput[];
}): Image2ChatCompletionRequest {
  return {
    model,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          ...referenceImages.map((image) => ({
            type: 'image_url' as const,
            image_url: {
              url: `data:${image.mimeType};base64,${image.data}`,
            },
          })),
        ],
      },
    ],
  };
}

export function buildImage2ImagesRequestBody({
  model,
  prompt,
  size,
  stream,
  partialImages,
  image2Options,
}: {
  model: string;
  prompt: string;
  size: string;
  stream?: boolean;
  partialImages?: number;
  image2Options?: Image2Options;
}): Image2ImagesRequestBody {
  const options = normalizeImage2Options(image2Options);
  const body: Image2ImagesRequestBody = {
    model,
    prompt,
    size,
    background: IMAGE2_FIXED_BACKGROUND,
    moderation: IMAGE2_FIXED_MODERATION,
  };

  if (options.quality) body.quality = options.quality;
  if (options.outputFormat) body.output_format = options.outputFormat;
  if (
    typeof options.outputCompression === 'number' &&
    (options.outputFormat === 'jpeg' || options.outputFormat === 'webp')
  ) {
    body.output_compression = options.outputCompression;
  }
  if (options.responseFormat) body.response_format = options.responseFormat;

  if (stream) {
    body.stream = true;
    if (typeof partialImages === 'number' && Number.isFinite(partialImages) && partialImages >= 0) {
      body.partial_images = Math.floor(partialImages);
    }
  }

  return body;
}

export function getImage2ImagesEndpoint(baseUrl: string, hasReferenceImages: boolean) {
  return `${normalizeImage2BaseUrl(baseUrl)}/images/${hasReferenceImages ? 'edits' : 'generations'}`;
}

export function getImage2NetworkErrorCode(error: unknown): string | null {
  if (!isRecord(error)) return null;

  if (typeof error.code === 'string') return error.code;

  const cause = error.cause;
  if (isRecord(cause) && typeof cause.code === 'string') {
    return cause.code;
  }

  return null;
}

export function isImage2RetriableNetworkError(error: unknown) {
  const code = getImage2NetworkErrorCode(error);
  if (
    code &&
    [
      'ECONNRESET',
      'ETIMEDOUT',
      'ECONNREFUSED',
      'ENOTFOUND',
      'EAI_AGAIN',
      'UND_ERR_CONNECT_TIMEOUT',
      'UND_ERR_SOCKET',
      'UND_ERR_HEADERS_TIMEOUT',
      'UND_ERR_BODY_TIMEOUT',
    ].includes(code)
  ) {
    return true;
  }

  if (error instanceof DOMException && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
    return true;
  }

  return error instanceof TypeError && /fetch failed/i.test(error.message);
}

export function isImage2RetriableHttpStatus(status: number) {
  return status === 502 || status === 503 || status === 504;
}

export function resolveImage2ProxyMode(value: string | undefined, hasProxy: boolean): Image2ProxyMode {
  const normalized = value?.trim().toLowerCase();
  if (normalized === 'direct' || normalized === 'auto' || normalized === 'proxy') {
    return normalized;
  }

  return 'direct';
}

export function resolveImage2HedgeEnabled(value: string | undefined) {
  const normalized = value?.trim().toLowerCase();
  return normalized === 'true' || normalized === '1';
}

export function resolveImage2AllowH2(value: string | undefined) {
  const normalized = value?.trim().toLowerCase();
  if (normalized === 'false' || normalized === '0') return false;
  return true;
}

export function getImage2AttemptChannels(
  proxyMode: Image2ProxyMode,
  hasProxy: boolean,
  maxAttempts: number
): Image2AttemptChannel[] {
  const attempts = Math.max(1, Math.floor(maxAttempts));
  if (!hasProxy || proxyMode === 'direct') {
    return Array.from({ length: attempts }, () => 'direct');
  }

  const startsWithProxy = proxyMode === 'proxy';
  return Array.from({ length: attempts }, (_, index) => {
    const useProxy = startsWithProxy ? index % 2 === 0 : index % 2 === 1;
    return useProxy ? 'proxy' : 'direct';
  });
}

export function getImage2AttemptGroups(
  proxyMode: Image2ProxyMode,
  hasProxy: boolean,
  maxAttempts: number
): Image2AttemptChannel[][] {
  const attempts = getImage2AttemptChannels(proxyMode, hasProxy, maxAttempts);
  if (!hasProxy || proxyMode === 'direct') {
    return attempts.map((attempt) => [attempt]);
  }

  const groups: Image2AttemptChannel[][] = [];
  for (let index = 0; index < attempts.length; index += 2) {
    groups.push(attempts.slice(index, index + 2));
  }

  return groups;
}

function extractImageUrlFromText(text: string): string | null {
  const dataUrlMatch = text.match(/data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=_-]+/);
  if (dataUrlMatch) return dataUrlMatch[0];

  const markdownImageMatch = text.match(/!\[[^\]]*]\(([^)]+)\)/);
  const markdownUrl = markdownImageMatch?.[1];
  if (markdownUrl?.startsWith('http')) return markdownUrl;

  const plainUrlMatch = text.match(/https?:\/\/[^\s)"']+/);
  return plainUrlMatch?.[0] ?? null;
}

function extractImageUrlFromPart(part: unknown): string | null {
  if (!isRecord(part)) return null;

  const imageUrl = part.image_url;
  if (typeof imageUrl === 'string') return imageUrl;

  if (isRecord(imageUrl) && typeof imageUrl.url === 'string') {
    return imageUrl.url;
  }

  if (typeof part.text === 'string') {
    return extractImageUrlFromText(part.text);
  }

  return null;
}

function inferImageMimeTypeFromBase64(base64: string) {
  return inferKnownImageMimeTypeFromBase64(base64) ?? 'image/png';
}

function inferKnownImageMimeTypeFromBase64(base64: string) {
  const normalized = base64.trim();
  if (normalized.startsWith('/9j/')) return 'image/jpeg';
  if (normalized.startsWith('iVBOR')) return 'image/png';
  if (normalized.startsWith('UklGR')) return 'image/webp';
  if (normalized.startsWith('R0lGOD')) return 'image/gif';
  return null;
}

function base64ImageToDataUrl(base64: string) {
  return `data:${inferImageMimeTypeFromBase64(base64)};base64,${base64}`;
}

export function extractImage2ImageUrl(response: unknown): string | null {
  if (!isRecord(response)) return null;

  if (typeof response.b64_json === 'string') {
    return base64ImageToDataUrl(response.b64_json);
  }

  if (typeof response.partial_image_b64 === 'string') {
    return base64ImageToDataUrl(response.partial_image_b64);
  }

  if (typeof response.url === 'string') {
    return response.url;
  }

  if (typeof response.result === 'string' && typeof response.type === 'string' && response.type.includes('image')) {
    return response.result.startsWith('data:image/') || response.result.startsWith('http')
      ? response.result
      : base64ImageToDataUrl(response.result);
  }

  const output = Array.isArray(response.output) ? response.output : [];
  for (const item of output) {
    const imageUrl = extractImage2ImageUrl(item);
    if (imageUrl) return imageUrl;
  }

  const data = Array.isArray(response.data) ? response.data : [];
  for (const item of data) {
    if (!isRecord(item)) continue;

    if (typeof item.b64_json === 'string') {
      return base64ImageToDataUrl(item.b64_json);
    }

    if (typeof item.url === 'string') {
      return item.url;
    }
  }

  const choices = Array.isArray(response.choices) ? response.choices : [];

  for (const choice of choices) {
    if (!isRecord(choice) || !isRecord(choice.message)) continue;

    const content = choice.message.content;
    if (typeof content === 'string') {
      const imageUrl = extractImageUrlFromText(content);
      if (imageUrl) return imageUrl;
    }

    if (Array.isArray(content)) {
      for (const part of content) {
        const imageUrl = extractImageUrlFromPart(part);
        if (imageUrl) return imageUrl;
      }
    }

    const images = choice.message.images;
    if (Array.isArray(images)) {
      for (const image of images) {
        const imageUrl = extractImageUrlFromPart(image);
        if (imageUrl) return imageUrl;
      }
    }
  }

  return null;
}

export function extractImage2ImageUrlFromSse(text: string): string | null {
  let finalImageUrl: string | null = null;
  let latestPartialImageUrl: string | null = null;

  for (const eventBlock of text.split(/\r?\n\r?\n/)) {
    const data = eventBlock
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.replace(/^data:\s?/, ''))
      .join('\n')
      .trim();

    if (!data || data === '[DONE]') continue;

    let payload: unknown;
    try {
      payload = JSON.parse(data);
    } catch {
      continue;
    }

    const imageUrl = extractImage2ImageUrl(payload);
    if (!imageUrl) continue;

    const eventType = isRecord(payload) && typeof payload.type === 'string' ? payload.type : '';
    if (eventType.includes('partial')) {
      latestPartialImageUrl = imageUrl;
    } else {
      finalImageUrl = imageUrl;
    }
  }

  return finalImageUrl ?? latestPartialImageUrl;
}
