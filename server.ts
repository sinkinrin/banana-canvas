import express from "express";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import path from "path";
import dotenv from "dotenv";
import { Agent, ProxyAgent } from "undici";
import { getLocalDataWatchIgnoreGlobs } from "./src/lib/devServerWatch";
import { createLocalProjectStore } from "./src/lib/localProjectStore";
import {
  buildBananaGenerateContentRequest,
  buildImage2ChatCompletionRequest,
  buildImage2ImagesRequestBody,
  createImage2Config,
  createImage2MaskEditPrompt,
  extractBananaImageUrl,
  extractImage2ImageUrl,
  extractImage2ImageUrlFromSse,
  IMAGE2_FIXED_BACKGROUND,
  IMAGE2_FIXED_MODERATION,
  getImage2AttemptChannels,
  getImage2AttemptGroups,
  getImage2ChatCompletionsEndpoint,
  getImage2ImagesEndpoint,
  getImage2NetworkErrorCode,
  getImageModelConfig,
  isImage2RetriableHttpStatus,
  isImage2RetriableNetworkError,
  normalizeBananaOptions,
  normalizeImage2Options,
  normalizeImageModel,
  type BananaOptions,
  type Image2AttemptChannel,
  type Image2Options,
  resolveImage2AllowH2,
  resolveImage2HedgeEnabled,
  resolveImage2ProxyMode,
  type ReferenceImageInput,
} from "./src/lib/imageModels";

dotenv.config();

type GenerateImageRequestBody = {
  prompt?: string;
  imageModel?: unknown;
  aspectRatio?: any;
  imageSize?: any;
  referenceImages?: ReferenceImageInput[];
  referenceImage?: ReferenceImageInput;
  maskImage?: ReferenceImageInput;
  bananaOptions?: unknown;
  image2Options?: unknown;
  customKey?: string;
};

type FetchInitWithDispatcher = RequestInit & { dispatcher?: unknown };

const directFetch = globalThis.fetch.bind(globalThis);
let proxyAgent: ProxyAgent | null = null;
let proxyAgentUrl = "";
let image2DirectAgent: Agent | null = null;

const DEFAULT_IMAGE2_MAX_ATTEMPTS = 1;
const DEFAULT_IMAGE2_REQUEST_TIMEOUT_MS = 240_000;
const DEFAULT_IMAGE2_PROXY_CONNECT_TIMEOUT_MS = 60_000;
const DEFAULT_IMAGE2_RETRY_DELAY_MS = 1_000;
const DEFAULT_IMAGE2_STREAM_PARTIAL_IMAGES = 1;
const IMAGE2_HEDGED_CANCEL_REASON = "image2-hedged-winner";

function getLocalDataDir() {
  const configured = process.env.BANANA_DATA_DIR?.trim();
  return configured ? path.resolve(configured) : path.join(process.cwd(), "data");
}

function sendProjectRouteError(res: express.Response, error: unknown) {
  const message = error instanceof Error ? error.message : "本地项目存储失败";
  const status = message.includes("Invalid project id")
    ? 400
    : message.includes("Project not found")
      ? 404
      : 500;
  res.status(status).json({ error: message });
}

function collectReferenceImages(body: GenerateImageRequestBody): ReferenceImageInput[] {
  return body.referenceImages || (body.referenceImage ? [body.referenceImage] : []);
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function extractErrorMessage(payload: unknown): string | null {
  if (typeof payload === "object" && payload !== null && "error" in payload) {
    const error = (payload as { error?: unknown }).error;
    if (typeof error === "string") return error;
    if (typeof error === "object" && error !== null && "message" in error) {
      const message = (error as { message?: unknown }).message;
      if (typeof message === "string") return message;
    }
  }

  return null;
}

function createRequestId() {
  return globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
}

function previewResponseBody(text: string) {
  return text.length > 500 ? `${text.slice(0, 500)}...` : text;
}

function getConfiguredProxyUrl() {
  return process.env.IMAGE2_HTTPS_PROXY || process.env.HTTPS_PROXY || process.env.HTTP_PROXY || "";
}

function getImage2ProxyMode(proxyUrl = getConfiguredProxyUrl()) {
  return resolveImage2ProxyMode(process.env.IMAGE2_PROXY_MODE, Boolean(proxyUrl));
}

function readPositiveIntEnv(name: string, fallback: number, max = Number.MAX_SAFE_INTEGER) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;

  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return fallback;

  return Math.min(Math.floor(value), max);
}

function readNonNegativeIntEnv(name: string, fallback: number, max = Number.MAX_SAFE_INTEGER) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;

  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return fallback;

  return Math.min(Math.floor(value), max);
}

function readBooleanEnv(name: string, fallback = false) {
  const normalized = process.env[name]?.trim().toLowerCase();
  if (!normalized) return fallback;
  if (normalized === "true" || normalized === "1" || normalized === "yes") return true;
  if (normalized === "false" || normalized === "0" || normalized === "no") return false;
  return fallback;
}

function redactProxyUrl(proxyUrl: string) {
  try {
    const url = new URL(proxyUrl);
    if (url.username) url.username = "***";
    if (url.password) url.password = "***";
    return url.toString();
  } catch {
    return "[invalid proxy url]";
  }
}

function getProxyAgent(proxyUrl: string) {
  if (!proxyAgent || proxyAgentUrl !== proxyUrl) {
    proxyAgent = new ProxyAgent({
      uri: proxyUrl,
      connectTimeout: readPositiveIntEnv(
        "IMAGE2_PROXY_CONNECT_TIMEOUT_MS",
        DEFAULT_IMAGE2_PROXY_CONNECT_TIMEOUT_MS
      ),
      headersTimeout: readPositiveIntEnv(
        "IMAGE2_REQUEST_TIMEOUT_MS",
        DEFAULT_IMAGE2_REQUEST_TIMEOUT_MS
      ),
      bodyTimeout: readPositiveIntEnv(
        "IMAGE2_REQUEST_TIMEOUT_MS",
        DEFAULT_IMAGE2_REQUEST_TIMEOUT_MS
      ),
    });
    proxyAgentUrl = proxyUrl;
  }

  return proxyAgent;
}

function getImage2DirectAgent() {
  const requestTimeoutMs = readPositiveIntEnv(
    "IMAGE2_REQUEST_TIMEOUT_MS",
    DEFAULT_IMAGE2_REQUEST_TIMEOUT_MS
  );
  const connectTimeoutMs = readPositiveIntEnv(
    "IMAGE2_DIRECT_CONNECT_TIMEOUT_MS",
    DEFAULT_IMAGE2_PROXY_CONNECT_TIMEOUT_MS
  );
  const allowH2 = resolveImage2AllowH2(process.env.IMAGE2_DIRECT_ALLOW_H2);

  if (!image2DirectAgent) {
    image2DirectAgent = new Agent({
      allowH2,
      connectTimeout: connectTimeoutMs,
      headersTimeout: requestTimeoutMs,
      bodyTimeout: requestTimeoutMs,
    });
  }

  return image2DirectAgent;
}

function summarizeNetworkError(error: unknown) {
  const code = getImage2NetworkErrorCode(error) || "unknown";
  const message = error instanceof Error ? error.message : String(error);
  return { code, message };
}

function fetchWithChannel(
  channel: Image2AttemptChannel,
  endpoint: string,
  createInit: () => RequestInit,
  proxyUrl: string,
  signal: AbortSignal
) {
  const init = {
    ...createInit(),
    signal,
  };

  if (channel === "proxy") {
    return directFetch(endpoint, {
      ...init,
      dispatcher: getProxyAgent(proxyUrl),
    } as FetchInitWithDispatcher);
  }

  return directFetch(endpoint, {
    ...init,
    dispatcher: getImage2DirectAgent(),
  } as FetchInitWithDispatcher);
}

async function previewResponse(response: Response) {
  try {
    return previewResponseBody(await response.clone().text());
  } catch {
    return "";
  }
}

type Image2AttemptResult =
  | {
      type: "response";
      attempt: number;
      channel: Image2AttemptChannel;
      response: Response;
      retryable: boolean;
      failureSummary?: string;
    }
  | {
      type: "error";
      attempt: number;
      channel: Image2AttemptChannel;
      retryable: boolean;
      failureSummary: string;
    }
  | {
      type: "cancelled";
      attempt: number;
      channel: Image2AttemptChannel;
    };

async function runImage2Attempt({
  requestId,
  attempt,
  totalAttempts,
  channel,
  endpoint,
  createInit,
  proxyUrl,
  timeoutMs,
  controller,
}: {
  requestId: string;
  attempt: number;
  totalAttempts: number;
  channel: Image2AttemptChannel;
  endpoint: string;
  createInit: () => RequestInit;
  proxyUrl: string;
  timeoutMs: number;
  controller: AbortController;
}): Promise<Image2AttemptResult> {
  const timeout = setTimeout(() => {
    controller.abort(new DOMException(`image2 attempt timed out after ${timeoutMs}ms`, "TimeoutError"));
  }, timeoutMs);
  timeout.unref?.();
  const startedAt = Date.now();

  console.info(
    `[image2:${requestId}] attempt=${attempt}/${totalAttempts} channel=${channel} timeoutMs=${timeoutMs}`
  );

  try {
    const response = await fetchWithChannel(channel, endpoint, createInit, proxyUrl, controller.signal);
    const elapsedMs = Date.now() - startedAt;
    console.info(
      `[image2:${requestId}] attempt=${attempt}/${totalAttempts} channel=${channel} status=${response.status} ok=${response.ok} ms=${elapsedMs}`
    );

    const retryable = isImage2RetriableHttpStatus(response.status);
    const bodyPreview = retryable ? await previewResponse(response) : "";
    return {
      type: "response",
      attempt,
      channel,
      response,
      retryable,
      failureSummary: retryable
        ? `${attempt}:${channel} HTTP ${response.status}${bodyPreview ? ` ${bodyPreview}` : ""}`
        : undefined,
    };
  } catch (error) {
    if (controller.signal.aborted && controller.signal.reason === IMAGE2_HEDGED_CANCEL_REASON) {
      return { type: "cancelled", attempt, channel };
    }

    const summarySource = controller.signal.aborted && controller.signal.reason
      ? controller.signal.reason
      : error;
    const { code, message } = summarizeNetworkError(summarySource);
    const retryable = isImage2RetriableNetworkError(summarySource);
    const elapsedMs = Date.now() - startedAt;
    console.warn(
      `[image2:${requestId}] attempt=${attempt}/${totalAttempts} channel=${channel} network error code=${code} message=${message} ms=${elapsedMs}`
    );

    return {
      type: "error",
      attempt,
      channel,
      retryable,
      failureSummary: `${attempt}:${channel} ${code} ${message}`,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchImage2WithNetworkFallback(
  requestId: string,
  endpoint: string,
  createInit: () => RequestInit
) {
  const proxyUrl = getConfiguredProxyUrl();
  const proxyMode = getImage2ProxyMode(proxyUrl);
  const maxAttempts = readPositiveIntEnv("IMAGE2_MAX_ATTEMPTS", DEFAULT_IMAGE2_MAX_ATTEMPTS, 8);
  const timeoutMs = readPositiveIntEnv("IMAGE2_REQUEST_TIMEOUT_MS", DEFAULT_IMAGE2_REQUEST_TIMEOUT_MS);
  const retryDelayMs = readPositiveIntEnv("IMAGE2_RETRY_DELAY_MS", DEFAULT_IMAGE2_RETRY_DELAY_MS, 30_000);
  const channels = getImage2AttemptChannels(proxyMode, Boolean(proxyUrl), maxAttempts);
  const hedgeEnabled = resolveImage2HedgeEnabled(process.env.IMAGE2_HEDGE_ENABLED);
  const concurrency = hedgeEnabled
    ? Math.min(
        getImage2AttemptGroups(proxyMode, Boolean(proxyUrl), maxAttempts)[0]?.length ?? 1,
        channels.length
      )
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
      reject(new Error(`image2 请求失败，尝试记录：${failures.join(" | ")}`));
    };

    const maybeFinish = () => {
      if (settled || activeAttempts > 0 || nextAttemptIndex < channels.length) return;
      if (lastRetryableResponse) {
        finishWithResponse(lastRetryableResponse);
        return;
      }
      finishWithError();
    };

    const launchNext = () => {
      if (settled || nextAttemptIndex >= channels.length) {
        maybeFinish();
        return;
      }

      const channel = channels[nextAttemptIndex];
      const attempt = nextAttemptIndex + 1;
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
          attempt,
          totalAttempts: channels.length,
          channel,
          endpoint,
          createInit,
          proxyUrl,
          timeoutMs,
          controller,
        }).then((result) => {
          activeControllers.delete(controller);
          activeAttempts -= 1;
          if (settled || result.type === "cancelled") {
            maybeFinish();
            return;
          }

          if (result.type === "response") {
            if (result.response.ok || !result.retryable) {
              finishWithResponse(result.response);
              return;
            }

            lastRetryableResponse = result.response;
            if (result.failureSummary) failures.push(result.failureSummary);
            console.warn(
              `[image2:${requestId}] attempt=${result.attempt}/${channels.length} channel=${result.channel} retryable HTTP ${result.response.status}; remaining=${channels.length - nextAttemptIndex}`
            );
          } else {
            failures.push(result.failureSummary);
            if (!result.retryable) {
              finishWithError();
              return;
            }
          }

          if (nextAttemptIndex < channels.length) {
            launchNext();
          }
          maybeFinish();
        });
      };

      if (retryDelayMs > 0 && attempt > concurrency) {
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

async function normalizeGeneratedImageUrl(imageUrl: string) {
  if (imageUrl.startsWith("data:image/")) return imageUrl;
  if (!imageUrl.startsWith("http://") && !imageUrl.startsWith("https://")) return imageUrl;

  let response: Response;
  try {
    response = await fetch(imageUrl);
  } catch (error) {
    const { code, message } = summarizeNetworkError(error);
    console.warn(`[image2] generated image url download failed code=${code} message=${message}; returning original url`);
    return imageUrl;
  }

  if (!response.ok) return imageUrl;

  const contentType = response.headers.get("content-type") || "image/png";
  if (!contentType.startsWith("image/")) return imageUrl;

  const buffer = Buffer.from(await response.arrayBuffer());
  return `data:${contentType};base64,${buffer.toString("base64")}`;
}

function toImage2Size(aspectRatio?: string, imageSize?: string) {
  if (aspectRatio === "16:9") return "1536x1024";
  if (aspectRatio === "9:16") return "1024x1536";
  if (aspectRatio === "4:3") return "1536x1024";
  if (aspectRatio === "3:4") return "1024x1536";
  if (imageSize === "512px" || imageSize === "512") return "1024x1024";
  return "1024x1024";
}

function base64ToBlob(image: ReferenceImageInput) {
  const binary = Buffer.from(image.data, "base64");
  return new Blob([binary], { type: image.mimeType || "image/png" });
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

  if (options.quality) formData.set("quality", options.quality);
  formData.set("background", IMAGE2_FIXED_BACKGROUND);
  if (options.outputFormat) formData.set("output_format", options.outputFormat);
  if (
    typeof options.outputCompression === "number" &&
    (options.outputFormat === "jpeg" || options.outputFormat === "webp")
  ) {
    formData.set("output_compression", String(options.outputCompression));
  }
  formData.set("moderation", IMAGE2_FIXED_MODERATION);
  if (options.responseFormat) formData.set("response_format", options.responseFormat);

  if (streamImages) {
    formData.set("stream", "true");
    formData.set("partial_images", String(partialImages));
  }
}

async function generateBananaImage({
  prompt,
  apiKey,
  aspectRatio,
  imageSize,
  images,
  bananaOptions,
}: {
  prompt: string;
  apiKey: string;
  aspectRatio?: any;
  imageSize?: any;
  images: ReferenceImageInput[];
  bananaOptions: BananaOptions;
}) {
  const ai = new GoogleGenAI({ apiKey });
  const request = buildBananaGenerateContentRequest({
    prompt,
    aspectRatio,
    imageSize,
    referenceImages: images,
    bananaOptions,
  });

  const response = await ai.models.generateContent(request as any);
  const imageUrl = extractBananaImageUrl(response);
  if (imageUrl) return imageUrl;

  throw new Error("响应中未找到图像数据。");
}

async function generateImage2Image({
  requestId,
  prompt,
  aspectRatio,
  imageSize,
  images,
  maskImage,
  image2Options,
}: {
  requestId: string;
  prompt: string;
  aspectRatio?: string;
  imageSize?: string;
  images: ReferenceImageInput[];
  maskImage?: ReferenceImageInput;
  image2Options: Image2Options;
}) {
  const image2Config = createImage2Config(process.env);
  if (image2Config.missingKeys.length > 0) {
    throw new Error(`image2 配置缺失：请在 .env 中设置 ${image2Config.missingKeys.join(", ")}`);
  }
  const normalizedImage2Options = normalizeImage2Options(image2Options);
  const streamImages = image2Config.endpointType === "images" && readBooleanEnv("IMAGE2_STREAM");
  const partialImages = streamImages
    ? normalizedImage2Options.partialImages ?? readNonNegativeIntEnv("IMAGE2_PARTIAL_IMAGES", DEFAULT_IMAGE2_STREAM_PARTIAL_IMAGES, 3)
    : 0;

  const endpoint = image2Config.endpointType === "images"
    ? getImage2ImagesEndpoint(image2Config.baseUrl, images.length > 0)
    : getImage2ChatCompletionsEndpoint(image2Config.baseUrl);

  if (maskImage && image2Config.endpointType !== "images") {
    throw new Error("Image2 蒙版编辑需要使用 Images API endpoint。");
  }

  if (maskImage && images.length === 0) {
    throw new Error("Image2 蒙版编辑需要至少一张原图。");
  }

  const requestPrompt = maskImage ? createImage2MaskEditPrompt(prompt) : prompt;

  console.info(
    `[image2:${requestId}] sending ${image2Config.endpointType} request baseUrl=${image2Config.baseUrl} url=${endpoint} model=${image2Config.model} refs=${images.length} mask=${Boolean(maskImage)} promptChars=${requestPrompt.length} stream=${streamImages} partialImages=${partialImages} options=${JSON.stringify(normalizedImage2Options)}`
  );

  const createRequestInit = (): RequestInit => {
    if (image2Config.endpointType === "images" && images.length > 0) {
      const formData = new FormData();
      formData.set("model", image2Config.model);
      formData.set("prompt", requestPrompt);
      formData.set("size", toImage2Size(aspectRatio, imageSize));
      appendImage2OptionsToFormData({
        formData,
        image2Options: normalizedImage2Options,
        streamImages,
        partialImages,
      });
      images.forEach((image, index) => {
        const extension = image.mimeType.split("/")[1] || "png";
        formData.append("image", base64ToBlob(image), `reference-${index + 1}.${extension}`);
      });
      if (maskImage) {
        formData.append("mask", base64ToBlob(maskImage), "mask.png");
      }

      return {
        method: "POST",
        headers: {
          Authorization: `Bearer ${image2Config.apiKey}`,
        },
        body: formData,
      };
    }

    if (image2Config.endpointType === "images") {
      return {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
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
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${image2Config.apiKey}`,
      },
      body: JSON.stringify(buildImage2ChatCompletionRequest({
        model: image2Config.model,
        prompt: requestPrompt,
        referenceImages: images,
      })),
    };
  };

  const response = await fetchImage2WithNetworkFallback(requestId, endpoint, createRequestInit);

  const responseText = await response.text();
  const responseJson = tryParseJson(responseText);
  console.info(`[image2:${requestId}] relay status=${response.status} ok=${response.ok}`);

  if (!response.ok) {
    const message = extractErrorMessage(responseJson) || responseText || "image2 图像生成失败";
    console.error(`[image2:${requestId}] relay error body=${previewResponseBody(responseText)}`);
    throw new Error(`image2 请求失败 (${response.status}): ${message}`);
  }

  const imageUrl = streamImages
    ? extractImage2ImageUrlFromSse(responseText) || extractImage2ImageUrl(responseJson)
    : extractImage2ImageUrl(responseJson);
  if (!imageUrl) {
    console.error(`[image2:${requestId}] no image in response body=${previewResponseBody(responseText)}`);
    throw new Error("image2 响应中未找到图像数据。");
  }

  const normalizedImageUrl = await normalizeGeneratedImageUrl(imageUrl);
  console.info(`[image2:${requestId}] image extracted type=${normalizedImageUrl.startsWith("data:image/") ? "data-url" : "url"}`);
  return normalizedImageUrl;
}

async function startServer() {
  // Proxy support: set HTTPS_PROXY or HTTP_PROXY environment variable to route
  // all outgoing Gemini API requests through a proxy.
  // Example: HTTPS_PROXY=http://127.0.0.1:7890
  const proxyUrl = getConfiguredProxyUrl();
  const image2ProxyMode = getImage2ProxyMode(proxyUrl);
  if (proxyUrl) {
    console.log(`[Proxy] Using proxy: ${redactProxyUrl(proxyUrl)} image2Mode=${image2ProxyMode}`);
    const agent = getProxyAgent(proxyUrl);
    globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      return directFetch(input, { ...(init ?? {}), dispatcher: agent } as FetchInitWithDispatcher);
    };
  }

  const app = express();
  const PORT = Number(process.env.PORT || 3000);
  const projectStore = createLocalProjectStore(getLocalDataDir());

  app.use(express.json({ limit: '50mb' }));

  // API routes FIRST
  app.get("/api/projects", async (_req, res) => {
    try {
      res.json({ projects: await projectStore.loadProjectIndex() });
    } catch (error) {
      sendProjectRouteError(res, error);
    }
  });

  app.post("/api/projects", async (req, res) => {
    try {
      const name = typeof req.body?.name === "string" ? req.body.name : "未命名项目";
      const project = await projectStore.createProject(name, req.body?.snapshot);
      res.json({ project });
    } catch (error) {
      sendProjectRouteError(res, error);
    }
  });

  app.post("/api/projects/import", async (req, res) => {
    try {
      const projects = Array.isArray(req.body?.projects) ? req.body.projects : [];
      await projectStore.importProjects(projects);
      res.json({ ok: true });
    } catch (error) {
      sendProjectRouteError(res, error);
    }
  });

  app.get("/api/projects/:projectId", async (req, res) => {
    try {
      const project = await projectStore.loadProject(req.params.projectId);
      if (!project) {
        res.status(404).json({ error: "项目不存在" });
        return;
      }
      res.json(project);
    } catch (error) {
      sendProjectRouteError(res, error);
    }
  });

  app.put("/api/projects/:projectId", async (req, res) => {
    try {
      await projectStore.saveProjectSnapshot(req.params.projectId, req.body);
      res.json({ ok: true });
    } catch (error) {
      sendProjectRouteError(res, error);
    }
  });

  app.patch("/api/projects/:projectId", async (req, res) => {
    try {
      const name = typeof req.body?.name === "string" ? req.body.name : "";
      const project = await projectStore.renameProject(req.params.projectId, name);
      if (!project) {
        res.status(404).json({ error: "项目不存在" });
        return;
      }
      res.json({ project });
    } catch (error) {
      sendProjectRouteError(res, error);
    }
  });

  app.delete("/api/projects/:projectId", async (req, res) => {
    try {
      await projectStore.deleteProject(req.params.projectId);
      res.json({ ok: true });
    } catch (error) {
      sendProjectRouteError(res, error);
    }
  });

  app.post("/api/generate-image", async (req, res) => {
    const requestId = createRequestId();
    try {
      const body = req.body as GenerateImageRequestBody;
      const { prompt = "", aspectRatio, imageSize, customKey } = body;
      const imageModel = normalizeImageModel(body.imageModel);
      const modelConfig = getImageModelConfig(imageModel);
      const apiKey = customKey || process.env.GEMINI_API_KEY;
      const bananaOptions = normalizeBananaOptions(body.bananaOptions);
      const image2Options = normalizeImage2Options(body.image2Options);
      const maskImage = body.maskImage;

      if (modelConfig.provider === "gemini" && !apiKey) {
        return res.status(401).json({ error: "需要 API Key" });
      }

      if (maskImage && modelConfig.provider !== "openai-chat") {
        return res.status(400).json({ error: "蒙版编辑仅支持 Image2。" });
      }

      const images = collectReferenceImages(body);
      console.info(
        `[generate-image:${requestId}] model=${imageModel} provider=${modelConfig.provider} refs=${images.length} promptChars=${prompt.length}${modelConfig.provider === "gemini" ? ` bananaOptions=${JSON.stringify(bananaOptions)}` : ""}`
      );
      const imageUrl = modelConfig.provider === "gemini"
        ? await generateBananaImage({
            prompt,
            apiKey: apiKey!,
            aspectRatio,
            imageSize,
            images,
            bananaOptions,
          })
        : await generateImage2Image({
            requestId,
            prompt,
            aspectRatio,
            imageSize,
            images,
            image2Options,
            maskImage,
          });

      res.json({ imageUrl, imageModel });
    } catch (error: any) {
      const message = error.message || "图像生成失败";
      console.error(`[generate-image:${requestId}] failed:`, error);
      res.status(500).json({ error: `${message}（请求 ID：${requestId}）`, requestId });
    }
  });

  app.post("/api/optimize-prompt", async (req, res) => {
    try {
      const { prompt, customKey } = req.body;
      const apiKey = customKey || process.env.GEMINI_API_KEY;
      
      if (!apiKey) {
        return res.status(401).json({ error: "需要 API Key" });
      }

      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: `你是一位 AI 图像生成的专家提示词工程师。
请优化以下提示词，以创建高度详细、视觉效果惊人的图像。
仅返回优化后的提示词文本，使用原始语言（如果是中文则返回中文，英文则返回英文），不要包含任何对话性文字、引号或 Markdown 格式。
原始提示词：${prompt}`,
      });
      
      res.json({ optimizedPrompt: response.text?.trim() || prompt });
    } catch (error: any) {
      console.error("Error optimizing prompt:", error);
      res.status(500).json({ error: error.message || "提示词优化失败" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        watch: {
          ignored: getLocalDataWatchIgnoreGlobs(),
        },
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
