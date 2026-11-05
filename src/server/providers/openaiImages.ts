import { Agent, ProxyAgent, FormData, fetch as undiciFetch } from 'undici';
import { appLog } from '../appLog';
import type { OfficialImageConnection } from '../officialImageConfig';
import { getRuntimeConfig, type RuntimeConfigManager } from '../runtimeConfig';
import { OFFICIAL_IMAGE_MIME, OFFICIAL_IMAGE_MODELS, isOfficialImageModel, officialImageRequestFields, resolveOfficialImageSize,
  validateOfficialImageOptions, type OfficialImageOptions, type OfficialImageReference } from '../../lib/officialImages';
import type { ImageModelId, ReferenceImageInput } from '../../lib/imageModels';
import { readReportedImageInfo, type GenerationResult, type GenerationInfo, type ImagePreview } from '../../lib/generationInfo';
import { readServerSentEvents } from '../../lib/sse';

const nativeFetch = undiciFetch as unknown as typeof globalThis.fetch;
const dispatchers = new Map<string, Agent | ProxyAgent>();
export function getOfficialImageDispatcher(connection: OfficialImageConnection) {
  const key = `${connection.proxyEnabled ? connection.proxyUrl : 'direct'}|${connection.requestTimeoutMs}`;
  let dispatcher = dispatchers.get(key);
  if (!dispatcher) {
    const timeouts = { connectTimeout: 30000, headersTimeout: connection.requestTimeoutMs, bodyTimeout: connection.requestTimeoutMs };
    dispatcher = connection.proxyEnabled ? new ProxyAgent({ uri: connection.proxyUrl, ...timeouts }) : new Agent(timeouts);
    dispatchers.set(key, dispatcher);
  }
  return dispatcher;
}
export class OfficialImageError extends Error {
  constructor(message: string, public status = 502, public code = 'OPENAI_IMAGES_ERROR', public upstreamRequestId?: string) {
    super(message); this.name = 'OfficialImageError';
  }
}
export type OfficialImageGenerateInput = {
  requestId: string; imageModel?: ImageModelId; prompt: string; aspectRatio?: string; imageSize?: string;
  images: ReferenceImageInput[]; maskImage?: ReferenceImageInput; markupImage?: ReferenceImageInput;
  officialImageOptions?: OfficialImageOptions; signal?: AbortSignal;
  onPreview?: (preview: ImagePreview) => void; onMetadata?: (info: GenerationInfo) => void;
};
function imageReference(image: ReferenceImageInput): OfficialImageReference {
  return { image_url: `data:${image.mimeType};base64,${image.data}` };
}
function imageFile(image: ReferenceImageInput) {
  return new Blob([Buffer.from(image.data, 'base64')], { type: image.mimeType });
}
export function buildOfficialImageRequest(input: OfficialImageGenerateInput, connection: OfficialImageConnection) {
  if (!isOfficialImageModel(input.imageModel)) throw new OfficialImageError('Unknown official image model', 400, 'INVALID_MODEL');
  const options = { ...input.officialImageOptions };
  const validation = validateOfficialImageOptions(options, input.imageModel, input.images.length, Boolean(input.maskImage), Boolean(input.markupImage));
  if (validation) throw new OfficialImageError(validation, 400, 'INVALID_IMAGE_OPTIONS');
  const vectorOrAnimation = options.outputFormat === 'svg' || options.outputFormat === 'gif';
  options.stream = vectorOrAnimation ? false : options.stream ?? connection.stream;
  if (options.stream && options.partialImages === undefined) options.partialImages = 1;
  if (!options.stream && options.partialImages !== undefined) throw new OfficialImageError('Partial images require streaming', 400, 'INVALID_IMAGE_OPTIONS');
  const fields = officialImageRequestFields(input.imageModel, input.prompt, options, options.outputFormat === 'gif' ? 'auto' : resolveOfficialImageSize(input.aspectRatio, input.imageSize));
  const edit = input.images.length > 0 || Boolean(options.imageInputs?.length);
  const headers: Record<string, string> = { Authorization: `Bearer ${connection.apiKey}` };
  if (connection.organization) headers['OpenAI-Organization'] = connection.organization;
  if (connection.project) headers['OpenAI-Project'] = connection.project;
  let body: BodyInit;
  // Use official multipart image[] uploads for local files; JSON covers URLs, File IDs and mixed inputs.
  if (edit && !options.imageInputs?.length && !options.mask && !options.markup) {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) form.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
    input.images.forEach((image, i) => form.append('image[]', imageFile(image), `reference-${i + 1}.${image.mimeType === 'image/jpeg' ? 'jpg' : image.mimeType.split('/')[1]}`));
    if (input.maskImage) form.set('mask', imageFile(input.maskImage), 'mask.png');
    if (input.markupImage) form.set('markup', imageFile(input.markupImage), 'markup.png');
    body = form as unknown as BodyInit;
  } else {
    if (edit) fields.images = [...input.images.map(imageReference), ...(options.imageInputs ?? [])];
    if (input.maskImage || options.mask) fields.mask = input.maskImage ? imageReference(input.maskImage) : options.mask;
    if (input.markupImage || options.markup) fields.markup = input.markupImage ? imageReference(input.markupImage) : options.markup;
    headers['Content-Type'] = 'application/json'; body = JSON.stringify(fields);
  }
  return { url: `${connection.baseUrl}/images/${edit ? 'edits' : 'generations'}`, init: { method: 'POST', headers, body, redirect: 'error' as const }, options };
}
function outputDataUrl(data: unknown, format: unknown, fallback = 'png') {
  if (typeof data !== 'string' || !data || !/^[A-Za-z0-9+/]+={0,2}$/.test(data) || data.length % 4 === 1) throw new OfficialImageError('OpenAI returned an invalid image payload', 502, 'INVALID_IMAGE_RESPONSE');
  const type = String(format ?? fallback) as keyof typeof OFFICIAL_IMAGE_MIME;
  if (!OFFICIAL_IMAGE_MIME[type]) throw new OfficialImageError('OpenAI returned an unknown image format', 502, 'INVALID_IMAGE_RESPONSE');
  return `data:${OFFICIAL_IMAGE_MIME[type]};base64,${data}`;
}
function upstreamError(value: unknown, status: number, requestId: string | null, secret: string) {
  const data = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const error = data.error && typeof data.error === 'object' ? data.error as Record<string, unknown> : data;
  const code = typeof error.code === 'string' ? error.code.slice(0, 100) : 'OPENAI_IMAGES_ERROR';
  let message = typeof error.message === 'string' ? error.message : `OpenAI Images request failed (${status})`;
  if (secret) message = message.replaceAll(secret, '[REDACTED]');
  message = message.replace(/sk-[A-Za-z0-9_-]+/g, '[REDACTED]');
  return new OfficialImageError(message.slice(0, 2000), status, code, requestId ?? undefined);
}
export async function generateOfficialImage(input: OfficialImageGenerateInput, {
  runtimeConfig, connection = runtimeConfig?.get().officialImages ?? getRuntimeConfig().officialImages,
  fetchImpl = nativeFetch,
}: { runtimeConfig?: RuntimeConfigManager; connection?: OfficialImageConnection; fetchImpl?: typeof globalThis.fetch } = {}): Promise<GenerationResult> {
  if (!connection.apiKey) throw new OfficialImageError('请在设置中填写 OpenAI 官方格式的 API Key。', 401, 'OPENAI_KEY_MISSING');
  if (connection.proxyEnabled && !connection.proxyUrl) throw new OfficialImageError('OpenAI proxy URL is required', 400, 'OPENAI_PROXY_MISSING');
  const request = buildOfficialImageRequest(input, connection);
  const timeout = AbortSignal.timeout(connection.requestTimeoutMs);
  const signal = input.signal ? AbortSignal.any([input.signal, timeout]) : timeout;
  appLog('info', 'openai-images', 'Official image request started', { model: input.imageModel, edit: request.url.endsWith('/edits'), proxy: connection.proxyEnabled, format: request.options.outputFormat ?? 'png' }, input.requestId);
  let response: Response;
  try {
    response = await fetchImpl(request.url, { ...request.init, signal, dispatcher: getOfficialImageDispatcher(connection) } as RequestInit);
  } catch (error) {
    if (signal.aborted) throw signal.reason;
    throw new OfficialImageError(error instanceof Error ? error.message : 'OpenAI connection failed', 502, 'OPENAI_CONNECTION_FAILED');
  }
  const upstreamId = response.headers.get('x-request-id');
  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => ({}));
    throw upstreamError(payload, response.status, upstreamId, connection.apiKey);
  }
  const images: string[] = []; let info: GenerationInfo = { apiModel: isOfficialImageModel(input.imageModel) ? OFFICIAL_IMAGE_MODELS[input.imageModel] : undefined,
    requestedQuality: request.options.quality ?? 'auto', requestedSize: request.options.size ?? (request.options.outputFormat === 'gif' ? 'auto' : resolveOfficialImageSize(input.aspectRatio, input.imageSize)), upstreamRequestId: upstreamId ?? undefined };
  const mergeInfo = (data: unknown) => { info = { ...info, ...readReportedImageInfo(data) }; };
  if (request.options.stream && response.headers.get('content-type')?.includes('text/event-stream')) {
    if (!response.body) throw new OfficialImageError('Empty OpenAI stream');
    await readServerSentEvents(response.body, event => {
      if (event.error || event.type === 'error' || String(event.type).endsWith('.failed')) throw upstreamError(event, 502, upstreamId, connection.apiKey);
      const type = String(event.type ?? '');
      if (type.endsWith('.partial_image')) {
        input.onPreview?.({ imageUrl: outputDataUrl(event.b64_json, event.output_format, request.options.outputFormat),
          index: typeof event.image_index === 'number' ? event.image_index : 0,
          partialImageIndex: typeof event.partial_image_index === 'number' ? event.partial_image_index : 0 });
      } else if (type.endsWith('.completed')) {
        const image = outputDataUrl(event.b64_json, event.output_format, request.options.outputFormat);
        if (typeof event.image_index === 'number') images[event.image_index] = image; else images.push(image);
        mergeInfo(event);
      }
    }, signal);
    if (!images.length || images.filter(Boolean).length !== images.length || images.length !== (request.options.n ?? 1)) throw new OfficialImageError('OpenAI stream ended without a completed image', 502, 'INCOMPLETE_IMAGE_STREAM', upstreamId ?? undefined);
  } else {
    const data = await response.json() as { data?: { b64_json?: string }[]; output_format?: string };
    if (!Array.isArray(data.data) || !data.data.length) throw new OfficialImageError('No image in OpenAI response', 502, 'INVALID_IMAGE_RESPONSE');
    images.push(...data.data.map(image => outputDataUrl(image.b64_json, data.output_format, request.options.outputFormat)));
    mergeInfo(data);
  }
  signal.throwIfAborted();
  input.onMetadata?.(info);
  appLog('info', 'openai-images', 'Official image request completed', { upstreamRequestId: upstreamId, count: images.length }, input.requestId);
  return { imageUrl: images[0], images, generationInfo: info };
}
