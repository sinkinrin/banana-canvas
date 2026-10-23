import { createGeminiClient } from './geminiClient';
import type { GeminiConnectionConfig } from '../../lib/geminiProvider';
import type { GenerationInfo } from '../../lib/generationInfo';
import {
  buildBananaGenerateContentRequest,
  extractBananaImageUrl,
  type BananaOptions,
  type ImageModelId,
  type ReferenceImageInput,
} from '../../lib/imageModels';

export function buildBananaProviderRequest({
  imageModel,
  prompt,
  aspectRatio,
  imageSize,
  images,
  bananaOptions,
}: {
  imageModel?: ImageModelId;
  prompt: string;
  aspectRatio?: unknown;
  imageSize?: unknown;
  images: ReferenceImageInput[];
  bananaOptions: BananaOptions;
}) {
  return buildBananaGenerateContentRequest({
    imageModel,
    prompt,
    aspectRatio,
    imageSize,
    referenceImages: images,
    bananaOptions,
  });
}

export function extractBananaProviderImageUrl(response: unknown) {
  return extractBananaImageUrl(response);
}

export async function generateBananaImage({
  imageModel,
  prompt,
  connection,
  aspectRatio,
  imageSize,
  images,
  bananaOptions,
  signal,
  onMetadata,
}: {
  imageModel: ImageModelId;
  prompt: string;
  connection: GeminiConnectionConfig;
  aspectRatio?: unknown;
  imageSize?: unknown;
  images: ReferenceImageInput[];
  bananaOptions: BananaOptions;
  signal?: AbortSignal;
  onMetadata?: (info: GenerationInfo) => void;
}) {
  const ai = createGeminiClient(connection);
  const request = buildBananaProviderRequest({
    imageModel,
    prompt,
    aspectRatio,
    imageSize,
    images,
    bananaOptions,
  });
  request.config = {
    ...request.config,
    abortSignal: signal,
  };

  const response = await ai.models.generateContent(request as any);
  const imageUrl = extractBananaProviderImageUrl(response);
  onMetadata?.({ apiModel: request.model, reportedModel: response.modelVersion,
    requestedSize: String(imageSize ?? 'auto'),
    inputTokens: response.usageMetadata?.promptTokenCount, outputTokens: response.usageMetadata?.candidatesTokenCount });
  if (imageUrl) return imageUrl;

  throw new Error('响应中未找到图像数据。');
}
