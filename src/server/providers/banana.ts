import { GoogleGenAI } from '@google/genai';
import {
  buildBananaGenerateContentRequest,
  extractBananaImageUrl,
  type BananaOptions,
  type ReferenceImageInput,
} from '../../lib/imageModels';

export function buildBananaProviderRequest({
  prompt,
  aspectRatio,
  imageSize,
  images,
  bananaOptions,
}: {
  prompt: string;
  aspectRatio?: unknown;
  imageSize?: unknown;
  images: ReferenceImageInput[];
  bananaOptions: BananaOptions;
}) {
  return buildBananaGenerateContentRequest({
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
  prompt,
  apiKey,
  aspectRatio,
  imageSize,
  images,
  bananaOptions,
}: {
  prompt: string;
  apiKey: string;
  aspectRatio?: unknown;
  imageSize?: unknown;
  images: ReferenceImageInput[];
  bananaOptions: BananaOptions;
}) {
  const ai = new GoogleGenAI({ apiKey });
  const request = buildBananaProviderRequest({
    prompt,
    aspectRatio,
    imageSize,
    images,
    bananaOptions,
  });

  const response = await ai.models.generateContent(request as any);
  const imageUrl = extractBananaProviderImageUrl(response);
  if (imageUrl) return imageUrl;

  throw new Error('响应中未找到图像数据。');
}
