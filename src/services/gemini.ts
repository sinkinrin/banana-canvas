
import {
  normalizeBananaOptions,
  normalizeImage2Options,
  normalizeImageModel,
  type BananaAspectRatio,
  type BananaImageSize,
  type BananaOptions,
  type Image2Options,
  type ImageModelId,
} from '../lib/imageModels';

export interface GenerateImageParams {
  prompt: string;
  imageModel?: ImageModelId;
  aspectRatio?: BananaAspectRatio;
  imageSize?: BananaImageSize | '512px';
  bananaOptions?: BananaOptions;
  image2Options?: Image2Options;
  referenceImages?: Array<{ data: string; mimeType: string; }>;
  maskImage?: { data: string; mimeType: 'image/png' };
  signal?: AbortSignal;
}

export type GenerateImagePayload = Omit<GenerateImageParams, 'signal' | 'imageModel'> & {
  imageModel: ImageModelId;
  customKey: string | null;
};

export function getGenerateImageTimeoutMs(imageModel?: ImageModelId) {
  return normalizeImageModel(imageModel) === 'image2' ? 300000 : 60000;
}

export function createGenerateImagePayload(
  params: GenerateImageParams,
  customKey: string | null
): GenerateImagePayload {
  const { signal, imageModel, bananaOptions, image2Options, ...restParams } = params;
  void signal;
  const normalizedBananaOptions = normalizeBananaOptions(bananaOptions);
  const normalizedImage2Options = normalizeImage2Options(image2Options);

  return {
    ...restParams,
    ...(Object.keys(normalizedBananaOptions).length > 0 ? { bananaOptions: normalizedBananaOptions } : {}),
    ...(Object.keys(normalizedImage2Options).length > 0 ? { image2Options: normalizedImage2Options } : {}),
    imageModel: normalizeImageModel(imageModel),
    customKey,
  };
}

export async function generateImage(params: GenerateImageParams): Promise<string> {
  const { signal: externalSignal } = params;
  const customKey = localStorage.getItem('custom_gemini_api_key');
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(
    () => timeoutController.abort(),
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
    const response = await fetch('/api/generate-image', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      signal,
      body: JSON.stringify(createGenerateImagePayload(params, customKey)),
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      let errorMessage = '图像生成失败';
      try {
        const text = await response.text();
        const json = JSON.parse(text);
        errorMessage = json.error || errorMessage;
      } catch {
        // non-JSON body, use default message
      }
      throw new Error(errorMessage);
    }

    const data = await response.json();
    return data.imageUrl;
  } catch (error) {
    clearTimeout(timeoutId);
    console.error("Error generating image:", error);
    throw error;
  } finally {
    if (externalSignal && externalAbortListener) {
      externalSignal.removeEventListener('abort', externalAbortListener);
    }
  }
}

export async function optimizePrompt(prompt: string): Promise<string> {
  const customKey = localStorage.getItem('custom_gemini_api_key');
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

  try {
    const response = await fetch('/api/optimize-prompt', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify({
        prompt,
        customKey,
      }),
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      let errorMessage = '提示词优化失败';
      try {
        const text = await response.text();
        const json = JSON.parse(text);
        errorMessage = json.error || errorMessage;
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
  }
}
