import { generateOfficialImage, OfficialImageError, type OfficialImageGenerateInput } from './providers/openaiImages';
import { appLog, protectLogText, redactLogText } from './appLog';
import express from 'express';
import { ImageInputError } from './imageInputError';
import { extractReferencePrimaryImages } from './prepareReferenceImages';
import { createGeminiClient } from './providers/geminiClient';
import { getGeminiConnectionError, type GeminiConnectionConfig } from '../lib/geminiProvider';
import {
  validateGenerateImageRequest,
} from './requestValidation';
import type {
  BananaAspectRatio,
  BananaImageSize,
  BananaOptions,
  Image2Options,
  ImageModelId,
  ReferenceImageInput,
} from '../lib/imageModels';
import { getRuntimeConfig, type RuntimeConfigManager } from './runtimeConfig';
import { normalizeGenerationInfo, type GenerationInfo } from '../lib/generationInfo';

export type BananaGenerateInput = {
  requestId?: string;
  onMetadata?: (info: GenerationInfo) => void;
  imageModel: ImageModelId;
  prompt: string;
  connection: GeminiConnectionConfig;
  aspectRatio?: BananaAspectRatio;
  imageSize?: BananaImageSize;
  images: ReferenceImageInput[];
  bananaOptions: BananaOptions;
  signal?: AbortSignal;
};

export type Image2GenerateInput = {
  onMetadata?: (info: GenerationInfo) => void;
  requestId: string;
  imageModel?: ImageModelId;
  prompt: string;
  aspectRatio?: BananaAspectRatio;
  imageSize?: BananaImageSize;
  images: ReferenceImageInput[];
  maskImage?: ReferenceImageInput;
  image2Options: Image2Options;
  signal?: AbortSignal;
};

export type GenerationProviders = {
  generateOfficialImage?: (input: OfficialImageGenerateInput) => Promise<import('../lib/generationInfo').GenerationResult>;
  generateBananaImage: (input: BananaGenerateInput) => Promise<string>;
  generateImage2Image: (input: Image2GenerateInput) => Promise<string>;
  optimizePrompt?: (input: {
    prompt: string;
    connection: GeminiConnectionConfig;
    model: string;
    signal?: AbortSignal;
  }) => Promise<string>;
};

function createRequestId() {
  return globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
}

async function defaultOptimizePrompt({
  prompt,
  connection,
  model,
  signal,
}: {
  prompt: string;
  connection: GeminiConnectionConfig;
  model: string;
  signal?: AbortSignal;
}) {
  const ai = createGeminiClient(connection);
  const response = await ai.models.generateContent({
    model,
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
    const startedAt = Date.now();
    res.setHeader('X-Request-ID', requestId);
    const requestAbort = createRequestAbort(req, res);
    const validation = validateGenerateImageRequest(req.body);
    if (!validation.ok) {
      requestAbort.cleanup();
      appLog('warn', 'generation', 'Request validation rejected', { reason: validation.error }, requestId);
      sendValidationFailure(res, validation.error);
      return;
    }

    const body = validation.value;
    const connection = runtimeConfig.get().geminiConnection;
    const connectionError = getGeminiConnectionError(connection);
    if (body.provider === 'gemini' && connectionError) {
      requestAbort.cleanup();
      appLog('warn', 'generation', 'Connection configuration missing', undefined, requestId);
      res.status(401).json({ error: connectionError });
      return;
    }

    const releasePrivateText = protectLogText(body.prompt);
    try {
      body.referenceImages = extractReferencePrimaryImages(body.referenceImages);
      console.info(
        `[generate-image:${requestId}] model=${body.imageModel} provider=${body.provider} refs=${body.referenceImages.length} promptChars=${body.prompt.length}`
      );
      appLog('debug', 'generation', 'Generation parameters', { aspectRatio: body.aspectRatio, imageSize: body.imageSize, bananaOptions: body.bananaOptions, image2Options: body.image2Options }, requestId);
      let generationInfo: GenerationInfo = {};
      const onMetadata = (info: GenerationInfo) => { generationInfo = normalizeGenerationInfo(info) ?? {}; };
      if (body.provider === 'openai-images') {
        const useEvents = req.headers.accept?.includes('text/event-stream');
        const sendEvent = (event: Record<string, unknown>) => {
          if (!canWriteResponse(res, requestAbort.signal)) return;
          if (!res.headersSent) { res.setHeader('Content-Type', 'text/event-stream'); res.setHeader('X-Accel-Buffering', 'no'); res.flushHeaders(); }
          res.write(`data: ${JSON.stringify(event)}\n\n`);
        };
        const input: OfficialImageGenerateInput = { requestId, imageModel: body.imageModel, prompt: body.prompt,
          aspectRatio: body.aspectRatio, imageSize: body.imageSize, images: body.referenceImages,
          maskImage: body.maskImage, markupImage: body.markupImage, officialImageOptions: body.officialImageOptions,
          signal: requestAbort.signal, onPreview: preview => { if (useEvents) sendEvent({ type: 'image.partial', ...preview }); } };
        const result = await (providers.generateOfficialImage ? providers.generateOfficialImage(input) : generateOfficialImage(input, { runtimeConfig }));
        if (canWriteResponse(res, requestAbort.signal)) {
          const data = { ...result, imageModel: body.imageModel, generationInfo: { ...result.generationInfo, elapsedMs: Date.now() - startedAt } };
          if (useEvents) { sendEvent({ type: 'image.completed', ...data }); res.end(); } else res.json(data);
        }
        return;
      }
      const imageUrl = body.provider === 'gemini'
        ? await providers.generateBananaImage({
            requestId,
            imageModel: body.imageModel,
            prompt: body.prompt,
            connection,
            aspectRatio: body.aspectRatio,
            imageSize: body.imageSize,
            images: body.referenceImages,
            bananaOptions: body.bananaOptions,
            signal: requestAbort.signal,
            onMetadata,
          })
        : await providers.generateImage2Image({
            requestId,
            imageModel: body.imageModel,
            prompt: body.prompt,
            aspectRatio: body.aspectRatio,
            imageSize: body.imageSize,
            images: body.referenceImages,
            image2Options: body.image2Options,
            maskImage: body.maskImage,
            signal: requestAbort.signal,
            onMetadata,
          });

      if (canWriteResponse(res, requestAbort.signal)) {
        appLog('info', 'generation', 'Generation completed', { model: body.imageModel, elapsedMs: Date.now() - startedAt }, requestId);
        res.json({ imageUrl, imageModel: body.imageModel,
          ...(req.body?.includeGenerationInfo === true ? { generationInfo: { ...generationInfo, elapsedMs: Date.now() - startedAt } } : {}),
        });
      }
    } catch (error) {
      if (!requestAbort.signal.aborted) {
        appLog('error', 'generation', 'Generation failed', { error, elapsedMs: Date.now() - startedAt }, requestId);
      }
      if (canWriteResponse(res, requestAbort.signal)) {
        if (body.provider === 'openai-images' || error instanceof OfficialImageError || res.headersSent) {
          const failure = { type: 'image.error', error: error instanceof Error ? redactLogText(error.message) : 'Image generation failed',
            code: error instanceof OfficialImageError ? error.code : 'OPENAI_IMAGES_ERROR', requestId,
            upstreamRequestId: error instanceof OfficialImageError ? error.upstreamRequestId : undefined };
          if (res.headersSent) { res.write(`data: ${JSON.stringify(failure)}\n\n`); res.end(); }
          else res.status(error instanceof OfficialImageError ? error.status : 502).json(failure);
        } else if (error instanceof ImageInputError) {
          res.status(422).json({ code: 'INVALID_REFERENCE_IMAGE', imageIndex: error.imageIndex,
            error: '参考图格式或颜色模式不受支持，请重新导出为普通 JPG 或 PNG 后重试。', requestId });
        } else {
          res.status(500).json({ error: `图像生成失败（请求 ID：${requestId}）`, requestId });
        }
      }
    } finally {
      releasePrivateText();
      if (requestAbort.signal.aborted) appLog('info', 'generation', 'Generation cancelled', { elapsedMs: Date.now() - startedAt }, requestId);
      requestAbort.cleanup();
    }
  });

  app.post('/api/optimize-prompt', async (req, res) => {
    const requestId = createRequestId();
    const startedAt = Date.now();
    res.setHeader('X-Request-ID', requestId);
    const requestAbort = createRequestAbort(req, res);
    let releasePrivateText = () => {};
    try {
      const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt : '';
      if (!prompt.trim() || prompt.length > 20_000) {
        res.status(400).json({ error: 'prompt must contain 1 to 20000 characters' });
        return;
      }
      releasePrivateText = protectLogText(prompt);
      const config = runtimeConfig.get();
      const connection = config.geminiConnection;
      const connectionError = getGeminiConnectionError(connection);
      if (connectionError) {
        res.status(401).json({ error: connectionError });
        return;
      }

      appLog('info', 'optimizer', 'Prompt optimization started', { model: config.geminiPromptOptimizerModel, provider: connection.provider, promptChars: prompt.length }, requestId);
      const optimizedPrompt = await (providers.optimizePrompt ?? defaultOptimizePrompt)({
        prompt,
        connection,
        model: config.geminiPromptOptimizerModel,
        signal: requestAbort.signal,
      });
      if (canWriteResponse(res, requestAbort.signal)) {
        appLog('info', 'optimizer', 'Prompt optimization completed', { elapsedMs: Date.now() - startedAt }, requestId);
        res.json({ optimizedPrompt });
      }
    } catch (error) {
      if (!requestAbort.signal.aborted) appLog('error', 'optimizer', 'Prompt optimization failed', { error, elapsedMs: Date.now() - startedAt }, requestId);
      if (canWriteResponse(res, requestAbort.signal)) {
        res.status(500).json({ error: '提示词优化失败' });
      }
    } finally {
      releasePrivateText();
      if (requestAbort.signal.aborted) appLog('info', 'optimizer', 'Prompt optimization cancelled', { elapsedMs: Date.now() - startedAt }, requestId);
      requestAbort.cleanup();
    }
  });
}
