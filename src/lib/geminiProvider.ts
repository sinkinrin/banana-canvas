export type GeminiProvider = 'ai-studio' | 'vertex-ai';
export type VertexAuthMode = 'api-key' | 'adc';

export type GeminiProviderSettings = {
  provider: GeminiProvider;
  baseUrl: string;
  vertexBaseUrl: string;
  vertexAuthMode: VertexAuthMode;
  vertexProject: string;
  vertexLocation: string;
};

export type GeminiConnectionConfig = GeminiProviderSettings & {
  apiKey: string;
  vertexApiKey: string;
};

export function getGeminiConnectionError(config: GeminiConnectionConfig): string | undefined {
  if (config.provider === 'ai-studio') {
    return config.apiKey ? undefined : '请在设置中填写 AI Studio API Key';
  }
  if (config.vertexAuthMode === 'api-key') {
    return config.vertexApiKey ? undefined : '请在设置中填写 Vertex AI Express Mode API Key';
  }
  return config.vertexProject && config.vertexLocation
    ? undefined
    : '请在设置中填写 Vertex AI 项目 ID 和区域';
}

export function getGeminiBaseUrl(config: GeminiProviderSettings): string {
  if (config.provider === 'ai-studio') {
    return config.baseUrl || 'https://generativelanguage.googleapis.com';
  }
  if (config.vertexBaseUrl) return config.vertexBaseUrl;
  if (config.vertexAuthMode === 'api-key' || config.vertexLocation === 'global') {
    return 'https://aiplatform.googleapis.com';
  }
  if (config.vertexLocation === 'us' || config.vertexLocation === 'eu') {
    return `https://aiplatform.${config.vertexLocation}.rep.googleapis.com`;
  }
  return `https://${config.vertexLocation}-aiplatform.googleapis.com`;
}
