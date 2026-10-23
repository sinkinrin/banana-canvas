import type { GeminiProviderSettings } from './geminiProvider';
import type { Image2ProxyMode } from './imageModels';

export type RuntimeSettingsSnapshot = {
  autoLoad: true;
  image2: {
    baseUrl: string;
    apiKeyConfigured: boolean;
    model: string;
    endpointType: 'auto' | 'chat' | 'images';
    proxyUrl: string;
    proxyMode: Image2ProxyMode;
    stream: boolean;
    partialImages: number;
    maxAttempts: number;
    requestTimeoutMs: number;
    ready: boolean;
    missingKeys: string[];
  };
  gemini: GeminiProviderSettings & {
    vertexApiKeyConfigured: boolean;
    apiKeyConfigured: boolean;
    promptOptimizerModel: string;
    proxyUrl: string;
    proxyEnabled: boolean;
  };
};

export type RuntimeSettingsUpdate = {
  image2?: {
    baseUrl?: string;
    apiKey?: string;
    clearApiKey?: boolean;
    model?: string;
    endpointType?: 'auto' | 'chat' | 'images';
    proxyUrl?: string;
    proxyMode?: Image2ProxyMode;
    stream?: boolean;
    partialImages?: number;
    maxAttempts?: number;
    requestTimeoutMs?: number;
  };
  gemini?: Partial<GeminiProviderSettings> & {
    vertexApiKey?: string;
    clearVertexApiKey?: boolean;
    apiKey?: string;
    clearApiKey?: boolean;
    promptOptimizerModel?: string;
    proxyUrl?: string;
    proxyEnabled?: boolean;
  };
};

export type RuntimeSettingsForm = {
  image2BaseUrl: string;
  image2ApiKey: string;
  clearImage2ApiKey: boolean;
  image2Model: string;
  image2EndpointType: 'auto' | 'chat' | 'images';
  image2ProxyUrl: string;
  image2ProxyMode: Image2ProxyMode;
  image2Stream: boolean;
  image2PartialImages: number;
  image2MaxAttempts: number;
  image2RequestTimeoutMs: number;
  geminiProvider: GeminiProviderSettings['provider'];
  geminiBaseUrl: string;
  vertexBaseUrl: string;
  vertexAuthMode: GeminiProviderSettings['vertexAuthMode'];
  vertexProject: string;
  vertexLocation: string;
  vertexApiKey: string;
  clearVertexApiKey: boolean;
  geminiApiKey: string;
  clearGeminiApiKey: boolean;
  geminiPromptOptimizerModel: string;
  geminiProxyUrl: string;
  geminiProxyEnabled: boolean;
};

export function createRuntimeSettingsForm(settings: RuntimeSettingsSnapshot): RuntimeSettingsForm {
  return {
    image2BaseUrl: settings.image2.baseUrl,
    image2ApiKey: '',
    clearImage2ApiKey: false,
    image2Model: settings.image2.model,
    image2EndpointType: settings.image2.endpointType,
    image2ProxyUrl: settings.image2.proxyUrl,
    image2ProxyMode: settings.image2.proxyMode,
    image2Stream: settings.image2.stream,
    image2PartialImages: settings.image2.partialImages,
    image2MaxAttempts: settings.image2.maxAttempts,
    image2RequestTimeoutMs: settings.image2.requestTimeoutMs,
    geminiProvider: settings.gemini.provider,
    geminiBaseUrl: settings.gemini.baseUrl,
    vertexBaseUrl: settings.gemini.vertexBaseUrl,
    vertexAuthMode: settings.gemini.vertexAuthMode,
    vertexProject: settings.gemini.vertexProject,
    vertexLocation: settings.gemini.vertexLocation,
    vertexApiKey: '',
    clearVertexApiKey: false,
    geminiApiKey: '',
    clearGeminiApiKey: false,
    geminiPromptOptimizerModel: settings.gemini.promptOptimizerModel,
    geminiProxyUrl: settings.gemini.proxyUrl,
    geminiProxyEnabled: settings.gemini.proxyEnabled,
  };
}

export function createRuntimeSettingsUpdate(form: RuntimeSettingsForm): RuntimeSettingsUpdate {
  return {
    image2: {
      baseUrl: form.image2BaseUrl.trim(),
      ...(form.image2ApiKey.trim() ? { apiKey: form.image2ApiKey.trim() } : {}),
      clearApiKey: form.clearImage2ApiKey,
      model: form.image2Model.trim(),
      endpointType: form.image2EndpointType,
      proxyUrl: form.image2ProxyUrl.trim(),
      proxyMode: form.image2ProxyMode,
      stream: form.image2Stream,
      partialImages: form.image2PartialImages,
      maxAttempts: form.image2MaxAttempts,
      requestTimeoutMs: form.image2RequestTimeoutMs,
    },
    gemini: {
      provider: form.geminiProvider,
      baseUrl: form.geminiBaseUrl.trim(),
      vertexBaseUrl: form.vertexBaseUrl.trim(),
      vertexAuthMode: form.vertexAuthMode,
      vertexProject: form.vertexProject.trim(),
      vertexLocation: form.vertexLocation.trim(),
      ...(form.vertexApiKey.trim() ? { vertexApiKey: form.vertexApiKey.trim() } : {}),
      clearVertexApiKey: form.clearVertexApiKey,
      ...(form.geminiApiKey.trim() ? { apiKey: form.geminiApiKey.trim() } : {}),
      clearApiKey: form.clearGeminiApiKey,
      promptOptimizerModel: form.geminiPromptOptimizerModel.trim(),
      proxyUrl: form.geminiProxyUrl.trim(),
      proxyEnabled: form.geminiProxyEnabled,
    },
  };
}
