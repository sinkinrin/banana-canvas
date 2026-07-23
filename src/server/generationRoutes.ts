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
import { getRuntimeConfig, type RuntimeConfigManager } from './runtimeConfig';

export type BananaGenerateInput = {
  prompt: string;
  apiKey: string;
  aspectRatio?: BananaAspectRatio;
  imageSize?: BananaImageSize;
  images: ReferenceImageInput[];
  bananaOptions: BananaOptions;
  signal?: AbortSignal;
};

export type Image2GenerateInput = {
  requestId: string;
  prompt: string;
  aspectRatio?: BananaAspectRatio;
  imageSize?: BananaImageSize;
  images: ReferenceImageInput[];
  maskImage?: ReferenceImageInput;
  image2Options: Image2Options;
  signal?: AbortSignal;
};

export type GenerationProviders = {
  generateBananaImage: (input: BananaGenerateInput) => Promise<string>;
  generateImage2Image: (input: Image2GenerateInput) => Promise<string>;
  optimizePrompt?: (input: { prompt: string; apiKey: string; signal?: AbortSignal }) => Promise<string>;
};

function createRequestId() {
  return globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
}

async function defaultOptimizePrompt({
  prompt,
  apiKey,
  signal,
}: {
  prompt: string;
  apiKey: string;
  signal?: AbortSignal;
}) {
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: 'gemini-3.1-pro-preview',
    contents: `你是一位 AI 图像生成的专家提示词工程师。
请优化以下提示词，以创建高度详细、视觉效果惊人的图像。
仅返回优化后的提示词文本，使用原始语言（如果是中文则返回中文，英文则返回英文），不要包含任何对话性文字、引号或 Markdown 格式。
原始提示词：${prompt}`,
    config: { abortSignal: signal },
  });
  return response.text?.trim() || prompt;
}

function sendValidationFailure(res: express.Response, error: string) {
  res.status(400).json({ error });
}

function resolveApiKey(_request: ValidGenerateImageRequest, runtimeConfig: RuntimeConfigManager) {
  return runtimeConfig.get().geminiApiKey;
}

function createRequestAbort(req: express.Request, res: express.Response) {
  const controller = new AbortController();
  const abort = () => {
    if (!controller.signal.aborted) controller.abort(new DOMException('Client disconnected', 'AbortError'));
  };
  const abortOnClose = () => {
    if (!res.writableEnded) abort();
  };

  req.once('aborted', abort);
  res.once('close', abortOnClose);

  return {
    signal: controller.signal,
    cleanup: () => {
      req.off('aborted', abort);
      res.off('close', abortOnClose);
    },
  };
}

function canWriteResponse(res: express.Response, signal: AbortSignal) {
  return !signal.aborted && !res.destroyed && !res.writableEnded;
}

export function mountGenerationRoutes(
  app: express.Express,
  {
    providers,
    runtimeConfig = { get: getRuntimeConfig, reload: () => ({ ok: true, config: getRuntimeConfig() }) },
  }: { providers: GenerationProviders; runtimeConfig?: RuntimeConfigManager }
) {
  app.post('/api/generate-image', async (req, res) => {
    const requestId = createRequestId();
    const requestAbort = createRequestAbort(req, res);
    const validation = validateGenerateImageRequest(req.body);
    if (!validation.ok) {
      requestAbort.cleanup();
      sendValidationFailure(res, validation.error);
      return;
    }

    const body = validation.value;
    const apiKey = resolveApiKey(body, runtimeConfig);
    if (body.provider === 'gemini' && !apiKey) {
      requestAbort.cleanup();
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
            signal: requestAbort.signal,
          })
        : await providers.generateImage2Image({
            requestId,
            prompt: body.prompt,
            aspectRatio: body.aspectRatio,
            imageSize: body.imageSize,
            images: body.referenceImages,
            image2Options: body.image2Options,
            maskImage: body.maskImage,
            signal: requestAbort.signal,
          });

      if (canWriteResponse(res, requestAbort.signal)) {
        res.json({ imageUrl, imageModel: body.imageModel });
      }
    } catch (error) {
      if (!requestAbort.signal.aborted) {
        console.error(`[generate-image:${requestId}] failed:`, error);
      }
      if (canWriteResponse(res, requestAbort.signal)) {
        res.status(500).json({ error: `图像生成失败（请求 ID：${requestId}）`, requestId });
      }
    } finally {
      requestAbort.cleanup();
    }
  });

  app.post('/api/optimize-prompt', async (req, res) => {
    const requestAbort = createRequestAbort(req, res);
    try {
      const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt : '';
      if (!prompt.trim() || prompt.length > 20_000) {
        res.status(400).json({ error: 'prompt must contain 1 to 20000 characters' });
        return;
      }
      const apiKey = runtimeConfig.get().geminiApiKey;
      if (!apiKey) {
        res.status(401).json({ error: '需要 API Key' });
        return;
      }

      const optimizedPrompt = await (providers.optimizePrompt ?? defaultOptimizePrompt)({
        prompt,
        apiKey,
        signal: requestAbort.signal,
      });
      if (canWriteResponse(res, requestAbort.signal)) res.json({ optimizedPrompt });
    } catch (error) {
      if (!requestAbort.signal.aborted) console.error('Error optimizing prompt:', error);
      if (canWriteResponse(res, requestAbort.signal)) {
        res.status(500).json({ error: '提示词优化失败' });
      }
    } finally {
      requestAbort.cleanup();
    }
  });
}
