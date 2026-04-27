import express from 'express';
import { GoogleGenAI } from '@google/genai';
import {
  validateGenerateImageRequest,
  type ValidGenerateImageRequest,
} from './requestValidation';
import type {
  BananaAspectRatio,
  BananaImageSize,
  BananaOptions,
  Image2Options,
  ReferenceImageInput,
} from '../lib/imageModels';

export type BananaGenerateInput = {
  prompt: string;
  apiKey: string;
  aspectRatio?: BananaAspectRatio;
  imageSize?: BananaImageSize;
  images: ReferenceImageInput[];
  bananaOptions: BananaOptions;
};

export type Image2GenerateInput = {
  requestId: string;
  prompt: string;
  aspectRatio?: BananaAspectRatio;
  imageSize?: BananaImageSize;
  images: ReferenceImageInput[];
  maskImage?: ReferenceImageInput;
  image2Options: Image2Options;
};

export type GenerationProviders = {
  generateBananaImage: (input: BananaGenerateInput) => Promise<string>;
  generateImage2Image: (input: Image2GenerateInput) => Promise<string>;
  optimizePrompt?: (input: { prompt: string; apiKey: string }) => Promise<string>;
};

function createRequestId() {
  return globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
}

async function defaultOptimizePrompt({ prompt, apiKey }: { prompt: string; apiKey: string }) {
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: 'gemini-3.1-pro-preview',
    contents: `你是一位 AI 图像生成的专家提示词工程师。
请优化以下提示词，以创建高度详细、视觉效果惊人的图像。
仅返回优化后的提示词文本，使用原始语言（如果是中文则返回中文，英文则返回英文），不要包含任何对话性文字、引号或 Markdown 格式。
原始提示词：${prompt}`,
  });
  return response.text?.trim() || prompt;
}

function sendValidationFailure(res: express.Response, error: string) {
  res.status(400).json({ error });
}

function resolveApiKey(request: ValidGenerateImageRequest) {
  return request.customKey || process.env.GEMINI_API_KEY;
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function mountGenerationRoutes(
  app: express.Express,
  { providers }: { providers: GenerationProviders }
) {
  app.post('/api/generate-image', async (req, res) => {
    const requestId = createRequestId();
    const validation = validateGenerateImageRequest(req.body);
    if (!validation.ok) {
      sendValidationFailure(res, validation.error);
      return;
    }

    const body = validation.value;
    const apiKey = resolveApiKey(body);
    if (body.provider === 'gemini' && !apiKey) {
      res.status(401).json({ error: '需要 API Key' });
      return;
    }

    try {
      console.info(
        `[generate-image:${requestId}] model=${body.imageModel} provider=${body.provider} refs=${body.referenceImages.length} promptChars=${body.prompt.length}`
      );
      const imageUrl = body.provider === 'gemini'
        ? await providers.generateBananaImage({
            prompt: body.prompt,
            apiKey: apiKey!,
            aspectRatio: body.aspectRatio,
            imageSize: body.imageSize,
            images: body.referenceImages,
            bananaOptions: body.bananaOptions,
          })
        : await providers.generateImage2Image({
            requestId,
            prompt: body.prompt,
            aspectRatio: body.aspectRatio,
            imageSize: body.imageSize,
            images: body.referenceImages,
            image2Options: body.image2Options,
            maskImage: body.maskImage,
          });

      res.json({ imageUrl, imageModel: body.imageModel });
    } catch (error) {
      const message = getErrorMessage(error, '图像生成失败');
      console.error(`[generate-image:${requestId}] failed:`, error);
      res.status(500).json({ error: `${message}（请求 ID：${requestId}）`, requestId });
    }
  });

  app.post('/api/optimize-prompt', async (req, res) => {
    try {
      const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt : '';
      const customKey = typeof req.body?.customKey === 'string' ? req.body.customKey : undefined;
      const apiKey = customKey || process.env.GEMINI_API_KEY;
      if (!apiKey) {
        res.status(401).json({ error: '需要 API Key' });
        return;
      }

      const optimizedPrompt = await (providers.optimizePrompt ?? defaultOptimizePrompt)({ prompt, apiKey });
      res.json({ optimizedPrompt });
    } catch (error) {
      console.error('Error optimizing prompt:', error);
      res.status(500).json({ error: getErrorMessage(error, '提示词优化失败') });
    }
  });
}
