import { appLog } from '../appLog';
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
  requestId,
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
  requestId?: string;
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

  appLog('debug', 'gemini', 'Sending generation request', { model: request.model, provider: connection.provider,
    baseUrl: connection.provider === 'vertex-ai' ? connection.vertexBaseUrl : connection.baseUrl, refs: images.length }, requestId);
  const response = await ai.models.generateContent(request as any);
  const summary = { model: response.modelVersion, candidates: response.candidates?.map((candidate) => ({
    finishReason: candidate.finishReason, parts: candidate.content?.parts?.map((part) => part.inlineData ? 'image' : part.text ? 'text' : 'other'),
  })), blockReason: response.promptFeedback?.blockReason, usage: response.usageMetadata };
  appLog('debug', 'gemini', 'Generation response received', summary, requestId);
  const imageUrl = extractBananaProviderImageUrl(response);
  onMetadata?.({ apiModel: request.model, reportedModel: response.modelVersion,
    requestedSize: String(imageSize ?? 'auto'),
    inputTokens: response.usageMetadata?.promptTokenCount, outputTokens: response.usageMetadata?.candidatesTokenCount });
  if (imageUrl) return imageUrl;

  appLog('warn', 'gemini', 'No image in generation response', summary, requestId);
  throw new Error('响应中未找到图像数据。');
}
