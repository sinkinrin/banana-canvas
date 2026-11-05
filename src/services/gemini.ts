import { isOfficialImageModel, type OfficialImageOptions } from '../lib/officialImages';
import { readServerSentEvents } from '../lib/sse';

import {
  isBananaImageModel,
  isImage2Model,
  normalizeBananaOptionsForModel,
  normalizeImage2Options,
  normalizeImageModel,
  type BananaAspectRatio,
  type BananaImageSize,
  type BananaOptions,
  type Image2Options,
  type ImageModelId,
} from '../lib/imageModels';
import i18n, { getCurrentLanguage } from '../i18n';
import { normalizeGenerationInfo, type GenerationResult, type ImagePreview } from '../lib/generationInfo';
import { prepareReferenceImages } from '../lib/prepareReferenceImages';

export interface GenerateImageParams {
  prompt: string;
  imageModel?: ImageModelId;
  aspectRatio?: BananaAspectRatio;
  imageSize?: BananaImageSize | '512px';
  bananaOptions?: BananaOptions;
  image2Options?: Image2Options;
  referenceImages?: Array<{ data: string; mimeType: string; }>;
  officialImageOptions?: OfficialImageOptions;
  onPreview?: (preview: ImagePreview) => void;
  markupImage?: { data: string; mimeType: 'image/png' };
  maskImage?: { data: string; mimeType: 'image/png' };
  signal?: AbortSignal;
}

export type GenerateImagePayload = Omit<GenerateImageParams, 'signal' | 'onPreview' | 'imageModel'> & {
  imageModel: ImageModelId;
};

export function getGenerateImageTimeoutMs(imageModel?: ImageModelId) {
  const normalizedModel = normalizeImageModel(imageModel);
  if (isOfficialImageModel(normalizedModel)) return 900000;
  return isImage2Model(normalizedModel) || normalizedModel === 'banana-pro' ? 300000 : 60000;
}

export function createGenerateImagePayload(
  params: GenerateImageParams
): GenerateImagePayload {
  const { signal, onPreview, imageModel, bananaOptions, image2Options, ...restParams } = params;
  void signal; void onPreview;
  const normalizedModel = normalizeImageModel(imageModel);
  const normalizedBananaOptions = isBananaImageModel(normalizedModel)
    ? normalizeBananaOptionsForModel(normalizedModel, bananaOptions)
    : {};
  const normalizedImage2Options = isImage2Model(normalizedModel)
    ? normalizeImage2Options(image2Options, normalizedModel)
    : {};

  return {
    ...restParams,
    ...(Object.keys(normalizedBananaOptions).length > 0 ? { bananaOptions: normalizedBananaOptions } : {}),
    ...(Object.keys(normalizedImage2Options).length > 0 ? { image2Options: normalizedImage2Options } : {}),
    imageModel: normalizedModel,
  };
}

async function requestImage(params: GenerateImageParams, includeGenerationInfo = false): Promise<GenerationResult> {
  const { signal: externalSignal } = params;
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(
    () => timeoutController.abort(new DOMException(i18n.t('errors.generationTimeout'), 'TimeoutError')),
    getGenerateImageTimeoutMs(params.imageModel)
  );

  // Merge external signal with timeout signal
  const signals: AbortSignal[] = [timeoutController.signal];
  if (externalSignal) signals.push(externalSignal);
  const signal = AbortSignal.any ? AbortSignal.any(signals) : timeoutController.signal;

  // If external signal is already aborted before we start, register a listener
  // to propagate it to the timeout controller for environments without AbortSignal.any
  let externalAbortListener: (() => void) | undefined;
  if (externalSignal && !AbortSignal.any) {
    externalAbortListener = () => timeoutController.abort();
    externalSignal.addEventListener('abort', externalAbortListener);
  }

  try {
    const payload = createGenerateImagePayload(params);
    if (payload.referenceImages?.length) {
      payload.referenceImages = await prepareReferenceImages(payload.referenceImages, signal, undefined, payload.imageModel);
    }
    signal.throwIfAborted();
    const response = await fetch('/api/generate-image', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept-Language': getCurrentLanguage(),
        ...(isOfficialImageModel(payload.imageModel) ? { Accept: 'text/event-stream' } : {}),
      },
      signal,
      body: JSON.stringify({ ...payload, ...(includeGenerationInfo ? { includeGenerationInfo: true } : {}) }),
    });

    if (!response.ok) {
      let errorMessage = i18n.t('errors.generationFailed');
      try {
        const text = await response.text();
        const json = JSON.parse(text) as { error?: string; requestId?: string; code?: string; imageIndex?: number };
        if (json.code === 'INVALID_REFERENCE_IMAGE') {
          errorMessage = Number.isInteger(json.imageIndex) && json.imageIndex! >= 1 && json.imageIndex! <= 4
            ? i18n.t('errors.referenceRejected', { index: json.imageIndex })
            : i18n.t('errors.referencesRejected');
        } else if (response.status === 401) {
          errorMessage = i18n.t('errors.apiKeyRequired');
        } else if (isOfficialImageModel(params.imageModel) && json.error) {
          errorMessage = `${json.error}${json.requestId ? ` (${json.requestId})` : ''}`;
        } else if (json.requestId) {
          errorMessage = i18n.t('errors.generationFailedWithRequestId', { requestId: json.requestId });
        } else if (response.status < 500 && json.error) {
          errorMessage = json.error;
        }
      } catch {
        // non-JSON body, use default message
      }
      throw new Error(errorMessage);
    }

    let data: GenerationResult;
    if (response.headers?.get('content-type')?.includes('text/event-stream')) {
      if (!response.body) throw new Error('Empty image stream');
      let completed: GenerationResult | undefined;
      await readServerSentEvents(response.body, event => {
        if (event.type === 'image.error') throw new Error(String(event.error ?? 'Image generation failed'));
        if (event.type === 'image.partial' && typeof event.imageUrl === 'string') params.onPreview?.(event as unknown as ImagePreview);
        if (event.type === 'image.completed' && typeof event.imageUrl === 'string') completed = event as unknown as GenerationResult;
      }, signal);
      if (!completed) throw new Error('Image stream ended without a completed result');
      data = completed;
    } else data = await response.json();
    signal.throwIfAborted();
    return { imageUrl: data.imageUrl, ...(data.images ? { images: data.images } : {}), generationInfo: normalizeGenerationInfo(data.generationInfo) };
  } catch (error) {
    clearTimeout(timeoutId);
    console.error("Error generating image:", error);
    throw error;
  } finally {
    clearTimeout(timeoutId);
    if (externalSignal && externalAbortListener) {
      externalSignal.removeEventListener('abort', externalAbortListener);
    }
  }
}

export async function optimizePrompt(prompt: string, externalSignal?: AbortSignal): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout
  const signal = externalSignal && AbortSignal.any
    ? AbortSignal.any([controller.signal, externalSignal])
    : controller.signal;
  const abortFromExternal = () => controller.abort();
  if (externalSignal && !AbortSignal.any) {
    externalSignal.addEventListener('abort', abortFromExternal, { once: true });
  }

  try {
    const response = await fetch('/api/optimize-prompt', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept-Language': getCurrentLanguage(),
      },
      signal,
      body: JSON.stringify({ prompt }),
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      let errorMessage = i18n.t('errors.optimizeFailed');
      try {
        const text = await response.text();
        const json = JSON.parse(text) as { error?: string };
        if (response.status === 401) {
          errorMessage = i18n.t('errors.apiKeyRequired');
        } else if (response.status < 500 && json.error) {
          errorMessage = json.error;
        }
      } catch {
        // non-JSON body, use default message
      }
      throw new Error(errorMessage);
    }

    const data = await response.json();
    return data.optimizedPrompt;
  } catch (error) {
    clearTimeout(timeoutId);
    console.error("Error optimizing prompt:", error);
    throw error;
  } finally {
    externalSignal?.removeEventListener('abort', abortFromExternal);
  }
}

export async function generateImage(params: GenerateImageParams): Promise<string> {
  return (await requestImage(params)).imageUrl;
}

export async function generateImageWithInfo(params: GenerateImageParams): Promise<GenerationResult> {
  return requestImage(params, true);
}
