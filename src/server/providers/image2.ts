import {
  DEFAULT_IMAGE2_REQUEST_TIMEOUT_MS,
  getConfiguredProxyUrl,
  getImage2DirectAgent,
  getImage2ProxyMode,
  getProxyAgent,
  readBooleanEnv,
  readNonNegativeIntEnv,
  readPositiveIntEnv,
  type EnvLike,
  type FetchInitWithDispatcher,
} from '../proxy';
import {
  buildImage2ChatCompletionRequest,
  buildImage2ImagesRequestBody,
  createImage2Config,
  createImage2MaskEditPrompt,
  extractImage2ImageUrl,
  extractImage2ImageUrlFromSse,
  getImage2ChatCompletionsEndpoint,
  getImage2ImagesEndpoint,
  getImage2NetworkErrorCode,
  isImage2RetriableHttpStatus,
  isImage2RetriableNetworkError,
  normalizeImage2Options,
  normalizeImage2BaseUrl,
  resolveImage2HedgeEnabled,
  type Image2Options,
  type Image2ProxyMode,
  type ReferenceImageInput,
} from '../../lib/imageModels';
import { getRuntimeConfig, type RuntimeConfigManager } from '../runtimeConfig';

const directFetch = globalThis.fetch.bind(globalThis);

const DEFAULT_IMAGE2_MAX_ATTEMPTS = 1;
const DEFAULT_IMAGE2_RETRY_DELAY_MS = 1_000;
const DEFAULT_IMAGE2_STREAM_PARTIAL_IMAGES = 1;
const IMAGE2_HEDGED_CANCEL_REASON = 'image2-hedged-winner';

export function previewResponseBody(text: string) {
  return text.length > 500 ? `${text.slice(0, 500)}...` : text;
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function extractErrorMessage(payload: unknown): string | null {
  if (typeof payload === 'object' && payload !== null && 'error' in payload) {
    const error = (payload as { error?: unknown }).error;
    if (typeof error === 'string') return error;
    if (typeof error === 'object' && error !== null && 'message' in error) {
      const message = (error as { message?: unknown }).message;
      if (typeof message === 'string') return message;
    }
  }

  return null;
}

function summarizeNetworkError(error: unknown) {
  const code = getImage2NetworkErrorCode(error) || 'unknown';
  const message = error instanceof Error ? error.message : String(error);
  return { code, message };
}

export function toImage2Size(aspectRatio?: string, imageSize?: string) {
  const isLandscape = aspectRatio === '16:9' || aspectRatio === '4:3';
  const isPortrait = aspectRatio === '9:16' || aspectRatio === '3:4';

  if (imageSize === '4K') {
    if (isLandscape) return '3584x2048';
    if (isPortrait) return '2048x3584';
    return '2816x2816';
  }

  let width = 1024;
  let height = 1024;

  if (isLandscape) {
    width = 1536;
  } else if (isPortrait) {
    height = 1536;
  }

  if (imageSize === '2K') {
    return `${width * 2}x${height * 2}`;
  }

  return `${width}x${height}`;
}

export function base64ToBlob(image: ReferenceImageInput) {
  const binary = Buffer.from(image.data, 'base64');
  return new Blob([binary], { type: image.mimeType || 'image/png' });
}

export function selectImage2Endpoint({
  baseUrl = 'https://api.openai.com/v1',
  referenceCount,
  hasMask,
}: {
  baseUrl?: string;
  referenceCount: number;
  hasMask: boolean;
}) {
  return getImage2ImagesEndpoint(baseUrl, referenceCount > 0 || hasMask);
}

export function getImage2AttemptPlan({
  proxyMode,
  hasProxy,
}: {
  proxyMode: Image2ProxyMode;
  hasProxy: boolean;
}) {
  if (proxyMode === 'direct' || !hasProxy) return [{ label: 'direct' as const, useProxy: false }];
  if (proxyMode === 'proxy') {
    return [
      { label: 'proxy' as const, useProxy: true },
      { label: 'direct' as const, useProxy: false },
    ];
  }
  return [
    { label: 'direct' as const, useProxy: false },
    { label: 'proxy' as const, useProxy: true },
  ];
}

export type Image2Attempt = ReturnType<typeof getImage2AttemptPlan>[number];

function expandImage2AttemptPlan(attempts: Image2Attempt[], maxAttempts: number) {
  const normalizedAttempts = Math.max(1, Math.floor(maxAttempts));
  if (attempts.length >= normalizedAttempts) return attempts.slice(0, normalizedAttempts);
  return Array.from({ length: normalizedAttempts }, (_, index) => attempts[index % attempts.length]);
}

export function parseImage2SseEvents(body: string) {
  const events: Record<string, unknown>[] = [];

  for (const eventBlock of body.split(/\r?\n\r?\n/)) {
    const data = eventBlock
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.replace(/^data:\s?/, ''))
      .join('\n')
      .trim();

    if (!data || data === '[DONE]') continue;

    try {
      const payload = JSON.parse(data);
      if (typeof payload === 'object' && payload !== null) {
        events.push(payload as Record<string, unknown>);
      }
    } catch {
      continue;
    }
  }

  return events;
}

export function extractImage2GeneratedUrl(responseBody: unknown, baseUrl: string) {
  const imageUrl = extractImage2ImageUrl(responseBody);
  if (!imageUrl) throw new Error('响应中未找到图像 URL。');
  if (imageUrl.startsWith('data:image/')) return imageUrl;
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) return imageUrl;
  return new URL(imageUrl, normalizeImage2BaseUrl(baseUrl)).toString();
}

export function buildImage2MultipartRequest({
  baseUrl = 'https://api.openai.com/v1',
  model,
  prompt,
  size,
  responseFormat,
  outputFormat,
  outputCompression,
  referenceImages,
  maskImage,
}: {
  baseUrl?: string;
  model?: string;
  prompt: string;
  size: string;
  responseFormat?: string;
  outputFormat?: string;
  outputCompression?: number;
  referenceImages: ReferenceImageInput[];
  maskImage?: ReferenceImageInput;
}) {
  const body = new FormData();
  if (model) body.set('model', model);
  body.set('prompt', prompt);
  body.set('size', size);
  body.set('background', 'opaque');
  body.set('moderation', 'low');
  if (responseFormat) body.set('response_format', responseFormat);
  if (outputFormat) body.set('output_format', outputFormat);
  if (
    typeof outputCompression === 'number' &&
    (outputFormat === 'jpeg' || outputFormat === 'webp')
  ) {
    body.set('output_compression', String(outputCompression));
  }

  referenceImages.forEach((reference, index) => {
    const extension = reference.mimeType.split('/')[1] || 'png';
    body.append('image', base64ToBlob(reference), `reference-${index + 1}.${extension}`);
  });
  if (maskImage) body.append('mask', base64ToBlob(maskImage), 'mask.png');

  return {
    endpoint: selectImage2Endpoint({
      baseUrl,
      referenceCount: referenceImages.length,
      hasMask: Boolean(maskImage),
    }),
    method: 'POST' as const,
    body,
  };
}

export async function fetchImage2WithNetworkFallback({
  url,
  init,
  attempts,
  fetchImpl = async (requestUrl, requestInit) => directFetch(requestUrl, requestInit),
  getProxyDispatcher,
  getDirectDispatcher,
}: {
  url: string;
  init: RequestInit;
  attempts: Image2Attempt[];
  fetchImpl?: (
    url: string,
    init: FetchInitWithDispatcher,
    attempt: Image2Attempt
  ) => Promise<Response>;
  getProxyDispatcher: () => unknown;
  getDirectDispatcher: () => unknown;
}) {
  let lastError: unknown;

  for (const attempt of attempts) {
    const dispatcher = attempt.useProxy ? getProxyDispatcher() : getDirectDispatcher();
    try {
      return await fetchImpl(url, { ...init, dispatcher }, attempt);
    } catch (error) {
      lastError = error;
      if (attempt === attempts[attempts.length - 1]) throw error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Image2 request failed');
}

async function previewResponse(response: Response) {
  try {
    return previewResponseBody(await response.clone().text());
  } catch {
    return '';
  }
}

type Image2AttemptResult =
  | {
      type: 'response';
      attempt: number;
      channel: Image2Attempt['label'];
      response: Response;
      retryable: boolean;
      failureSummary?: string;
    }
  | {
      type: 'error';
      attempt: number;
      channel: Image2Attempt['label'];
      retryable: boolean;
      failureSummary: string;
    }
  | {
      type: 'cancelled';
      attempt: number;
      channel: Image2Attempt['label'];
    };

async function runImage2Attempt({
  requestId,
  attemptNumber,
  totalAttempts,
  attempt,
  endpoint,
  createInit,
  proxyUrl,
  timeoutMs,
  controller,
  env,
}: {
  requestId: string;
  attemptNumber: number;
  totalAttempts: number;
  attempt: Image2Attempt;
  endpoint: string;
  createInit: () => RequestInit;
  proxyUrl: string;
  timeoutMs: number;
  controller: AbortController;
  env: EnvLike;
}): Promise<Image2AttemptResult> {
  const timeout = setTimeout(() => {
    controller.abort(new DOMException(`image2 attempt timed out after ${timeoutMs}ms`, 'TimeoutError'));
  }, timeoutMs);
  timeout.unref?.();
  const startedAt = Date.now();

  console.info(
    `[image2:${requestId}] attempt=${attemptNumber}/${totalAttempts} channel=${attempt.label} timeoutMs=${timeoutMs}`
  );

  try {
    const response = await fetchImage2WithNetworkFallback({
      url: endpoint,
      init: { ...createInit(), signal: controller.signal },
      attempts: [attempt],
      fetchImpl: async (requestUrl, requestInit) => directFetch(requestUrl, requestInit),
      getProxyDispatcher: () => getProxyAgent(proxyUrl, env),
      getDirectDispatcher: () => getImage2DirectAgent(env),
    });
    const elapsedMs = Date.now() - startedAt;
    console.info(
      `[image2:${requestId}] attempt=${attemptNumber}/${totalAttempts} channel=${attempt.label} status=${response.status} ok=${response.ok} ms=${elapsedMs}`
    );

    const retryable = isImage2RetriableHttpStatus(response.status);
    const bodyPreview = retryable ? await previewResponse(response) : '';
    return {
      type: 'response',
      attempt: attemptNumber,
      channel: attempt.label,
      response,
      retryable,
      failureSummary: retryable
        ? `${attemptNumber}:${attempt.label} HTTP ${response.status}${bodyPreview ? ` ${bodyPreview}` : ''}`
        : undefined,
    };
  } catch (error) {
    if (controller.signal.aborted && controller.signal.reason === IMAGE2_HEDGED_CANCEL_REASON) {
      return { type: 'cancelled', attempt: attemptNumber, channel: attempt.label };
    }

    const summarySource = controller.signal.aborted && controller.signal.reason
      ? controller.signal.reason
      : error;
    const { code, message } = summarizeNetworkError(summarySource);
    const retryable = isImage2RetriableNetworkError(summarySource);
    const elapsedMs = Date.now() - startedAt;
    console.warn(
      `[image2:${requestId}] attempt=${attemptNumber}/${totalAttempts} channel=${attempt.label} network error code=${code} message=${message} ms=${elapsedMs}`
    );

    return {
      type: 'error',
      attempt: attemptNumber,
      channel: attempt.label,
      retryable,
      failureSummary: `${attemptNumber}:${attempt.label} ${code} ${message}`,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchImage2ProviderResponse(
  requestId: string,
  endpoint: string,
  createInit: () => RequestInit,
  env: EnvLike = getRuntimeConfig().env
) {
  const proxyUrl = getConfiguredProxyUrl(env);
  const proxyMode = getImage2ProxyMode(proxyUrl, env);
  const maxAttempts = readPositiveIntEnv(env, 'IMAGE2_MAX_ATTEMPTS', DEFAULT_IMAGE2_MAX_ATTEMPTS, 8);
  const timeoutMs = readPositiveIntEnv(env, 'IMAGE2_REQUEST_TIMEOUT_MS', DEFAULT_IMAGE2_REQUEST_TIMEOUT_MS);
  const retryDelayMs = readPositiveIntEnv(env, 'IMAGE2_RETRY_DELAY_MS', DEFAULT_IMAGE2_RETRY_DELAY_MS, 30_000);
  const attempts = expandImage2AttemptPlan(
    getImage2AttemptPlan({ proxyMode, hasProxy: Boolean(proxyUrl) }),
    maxAttempts
  );
  const hedgeEnabled = resolveImage2HedgeEnabled(env.IMAGE2_HEDGE_ENABLED);
  const concurrency = hedgeEnabled
    ? Math.min(attempts.length, getImage2AttemptPlan({ proxyMode, hasProxy: Boolean(proxyUrl) }).length)
    : 1;
  const failures: string[] = [];
  let nextAttemptIndex = 0;
  let activeAttempts = 0;
  let settled = false;
  let lastRetryableResponse: Response | null = null;
  const activeControllers = new Set<AbortController>();

  return await new Promise<Response>((resolve, reject) => {
    const abortActiveAttempts = () => {
      for (const controller of activeControllers) {
        if (!controller.signal.aborted) {
          controller.abort(IMAGE2_HEDGED_CANCEL_REASON);
        }
      }
      activeControllers.clear();
    };

    const finishWithResponse = (response: Response) => {
      if (settled) return;
      settled = true;
      abortActiveAttempts();
      resolve(response);
    };

    const finishWithError = () => {
      if (settled) return;
      settled = true;
      abortActiveAttempts();
      reject(new Error(`image2 请求失败，尝试记录：${failures.join(' | ')}`));
    };

    const maybeFinish = () => {
      if (settled || activeAttempts > 0 || nextAttemptIndex < attempts.length) return;
      if (lastRetryableResponse) {
        finishWithResponse(lastRetryableResponse);
        return;
      }
      finishWithError();
    };

    const launchNext = () => {
      if (settled || nextAttemptIndex >= attempts.length) {
        maybeFinish();
        return;
      }

      const attempt = attempts[nextAttemptIndex];
      const attemptNumber = nextAttemptIndex + 1;
      nextAttemptIndex += 1;
      activeAttempts += 1;

      const launch = () => {
        if (settled) {
          activeAttempts -= 1;
          maybeFinish();
          return;
        }

        const controller = new AbortController();
        activeControllers.add(controller);
        void runImage2Attempt({
          requestId,
          attemptNumber,
          totalAttempts: attempts.length,
          attempt,
          endpoint,
          createInit,
          proxyUrl,
          timeoutMs,
          controller,
          env,
        }).then((result) => {
          activeControllers.delete(controller);
          activeAttempts -= 1;
          if (settled || result.type === 'cancelled') {
            maybeFinish();
            return;
          }

          if (result.type === 'response') {
            if (result.response.ok || !result.retryable) {
              finishWithResponse(result.response);
              return;
            }

            lastRetryableResponse = result.response;
            if (result.failureSummary) failures.push(result.failureSummary);
            console.warn(
              `[image2:${requestId}] attempt=${result.attempt}/${attempts.length} channel=${result.channel} retryable HTTP ${result.response.status}; remaining=${attempts.length - nextAttemptIndex}`
            );
          } else {
            failures.push(result.failureSummary);
            if (!result.retryable) {
              finishWithError();
              return;
            }
          }

          if (nextAttemptIndex < attempts.length) {
            launchNext();
          }
          maybeFinish();
        });
      };

      if (retryDelayMs > 0 && attemptNumber > concurrency) {
        setTimeout(launch, retryDelayMs).unref?.();
      } else {
        launch();
      }
    };

    for (let index = 0; index < concurrency; index += 1) {
      launchNext();
    }
  });
}

async function fetchGeneratedImageUrl(imageUrl: string, env: EnvLike) {
  const proxyUrl = getConfiguredProxyUrl(env);
  const proxyMode = getImage2ProxyMode(proxyUrl, env);
  const maxAttempts = readPositiveIntEnv(env, 'IMAGE2_MAX_ATTEMPTS', DEFAULT_IMAGE2_MAX_ATTEMPTS, 8);
  const attempts = expandImage2AttemptPlan(
    getImage2AttemptPlan({ proxyMode, hasProxy: Boolean(proxyUrl) }),
    maxAttempts
  );

  return await fetchImage2WithNetworkFallback({
    url: imageUrl,
    init: { method: 'GET' },
    attempts,
    fetchImpl: async (requestUrl, requestInit) => globalThis.fetch(requestUrl, requestInit),
    getProxyDispatcher: () => getProxyAgent(proxyUrl, env),
    getDirectDispatcher: () => getImage2DirectAgent(env),
  });
}

async function normalizeGeneratedImageUrl(imageUrl: string, env: EnvLike) {
  if (imageUrl.startsWith('data:image/')) return imageUrl;
  if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://')) return imageUrl;

  let response: Response;
  try {
    response = await fetchGeneratedImageUrl(imageUrl, env);
  } catch (error) {
    const { code, message } = summarizeNetworkError(error);
    console.warn(`[image2] generated image url download failed code=${code} message=${message}; returning original url`);
    return imageUrl;
  }

  if (!response.ok) return imageUrl;

  const contentType = response.headers.get('content-type') || 'image/png';
  if (!contentType.startsWith('image/')) return imageUrl;

  const buffer = Buffer.from(await response.arrayBuffer());
  return `data:${contentType};base64,${buffer.toString('base64')}`;
}

function appendImage2OptionsToFormData({
  formData,
  image2Options,
  streamImages,
  partialImages,
}: {
  formData: FormData;
  image2Options: Image2Options;
  streamImages: boolean;
  partialImages: number;
}) {
  const options = normalizeImage2Options(image2Options);

  if (options.quality) formData.set('quality', options.quality);
  formData.set('background', 'opaque');
  if (options.outputFormat) formData.set('output_format', options.outputFormat);
  if (
    typeof options.outputCompression === 'number' &&
    (options.outputFormat === 'jpeg' || options.outputFormat === 'webp')
  ) {
    formData.set('output_compression', String(options.outputCompression));
  }
  formData.set('moderation', 'low');
  if (options.responseFormat) formData.set('response_format', options.responseFormat);

  if (streamImages) {
    formData.set('stream', 'true');
    formData.set('partial_images', String(partialImages));
  }
}

export async function generateImage2Image({
  requestId,
  prompt,
  aspectRatio,
  imageSize,
  images,
  maskImage,
  image2Options,
  runtimeConfig,
}: {
  requestId: string;
  prompt: string;
  aspectRatio?: string;
  imageSize?: string;
  images: ReferenceImageInput[];
  maskImage?: ReferenceImageInput;
  image2Options: Image2Options;
  runtimeConfig?: RuntimeConfigManager;
}) {
  const env = runtimeConfig?.get().env ?? getRuntimeConfig().env;
  const image2Config = createImage2Config(env);
  if (image2Config.missingKeys.length > 0) {
    throw new Error(`image2 配置缺失：请在 .env 中设置 ${image2Config.missingKeys.join(', ')}`);
  }

  const normalizedImage2Options = normalizeImage2Options(image2Options);
  const streamImages = image2Config.endpointType === 'images' && readBooleanEnv(env, 'IMAGE2_STREAM');
  const partialImages = streamImages
    ? normalizedImage2Options.partialImages ?? readNonNegativeIntEnv(
        env,
        'IMAGE2_PARTIAL_IMAGES',
        DEFAULT_IMAGE2_STREAM_PARTIAL_IMAGES,
        3
      )
    : 0;

  const endpoint = image2Config.endpointType === 'images'
    ? selectImage2Endpoint({
        baseUrl: image2Config.baseUrl,
        referenceCount: images.length,
        hasMask: Boolean(maskImage),
      })
    : getImage2ChatCompletionsEndpoint(image2Config.baseUrl);

  if (maskImage && image2Config.endpointType !== 'images') {
    throw new Error('Image2 蒙版编辑需要使用 Images API endpoint。');
  }

  if (maskImage && images.length === 0) {
    throw new Error('Image2 蒙版编辑需要至少一张原图。');
  }

  const requestPrompt = maskImage ? createImage2MaskEditPrompt(prompt) : prompt;

  console.info(
    `[image2:${requestId}] sending ${image2Config.endpointType} request baseUrl=${image2Config.baseUrl} url=${endpoint} model=${image2Config.model} refs=${images.length} mask=${Boolean(maskImage)} promptChars=${requestPrompt.length} stream=${streamImages} partialImages=${partialImages} options=${JSON.stringify(normalizedImage2Options)}`
  );

  const createRequestInit = (): RequestInit => {
    if (image2Config.endpointType === 'images' && images.length > 0) {
      const request = buildImage2MultipartRequest({
        baseUrl: image2Config.baseUrl,
        model: image2Config.model,
        prompt: requestPrompt,
        size: toImage2Size(aspectRatio, imageSize),
        responseFormat: normalizedImage2Options.responseFormat,
        outputFormat: normalizedImage2Options.outputFormat,
        outputCompression: normalizedImage2Options.outputCompression,
        referenceImages: images,
        maskImage,
      });
      appendImage2OptionsToFormData({
        formData: request.body,
        image2Options: normalizedImage2Options,
        streamImages,
        partialImages,
      });

      return {
        method: request.method,
        headers: {
          Authorization: `Bearer ${image2Config.apiKey}`,
        },
        body: request.body,
      };
    }

    if (image2Config.endpointType === 'images') {
      return {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${image2Config.apiKey}`,
        },
        body: JSON.stringify(buildImage2ImagesRequestBody({
          model: image2Config.model,
          prompt: requestPrompt,
          size: toImage2Size(aspectRatio, imageSize),
          stream: streamImages,
          partialImages,
          image2Options: normalizedImage2Options,
        })),
      };
    }

    return {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${image2Config.apiKey}`,
      },
      body: JSON.stringify(buildImage2ChatCompletionRequest({
        model: image2Config.model,
        prompt: requestPrompt,
        referenceImages: images,
      })),
    };
  };

  const response = await fetchImage2ProviderResponse(requestId, endpoint, createRequestInit, env);

  const responseText = await response.text();
  const responseJson = tryParseJson(responseText);
  console.info(`[image2:${requestId}] relay status=${response.status} ok=${response.ok}`);

  if (!response.ok) {
    const message = extractErrorMessage(responseJson) || responseText || 'image2 图像生成失败';
    console.error(`[image2:${requestId}] relay error body=${previewResponseBody(responseText)}`);
    throw new Error(`image2 请求失败 (${response.status}): ${message}`);
  }

  const imageUrl = streamImages
    ? extractImage2ImageUrlFromSse(responseText) || extractImage2ImageUrl(responseJson)
    : extractImage2ImageUrl(responseJson);
  if (!imageUrl) {
    console.error(`[image2:${requestId}] no image in response body=${previewResponseBody(responseText)}`);
    throw new Error('image2 响应中未找到图像数据。');
  }

  const normalizedImageUrl = await normalizeGeneratedImageUrl(imageUrl, env);
  console.info(`[image2:${requestId}] image extracted type=${normalizedImageUrl.startsWith('data:image/') ? 'data-url' : 'url'}`);
  return normalizedImageUrl;
}
