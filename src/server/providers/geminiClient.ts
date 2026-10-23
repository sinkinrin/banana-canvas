import { GoogleGenAI, type GoogleGenAIOptions } from '@google/genai';
import {
  getGeminiBaseUrl,
  getGeminiConnectionError,
  type GeminiConnectionConfig,
} from '../../lib/geminiProvider';

export function buildGeminiClientOptions(config: GeminiConnectionConfig): GoogleGenAIOptions {
  const error = getGeminiConnectionError(config);
  if (error) throw new Error(error);
  const vertexai = config.provider === 'vertex-ai';
  // Accept both a service root and a versioned gateway prefix, without duplicating /v1.
  const url = new URL(getGeminiBaseUrl(config));
  const pathname = url.pathname.replace(/\/+$/, '');
  const version = pathname.match(/\/(v1(?:beta1?|alpha)?)$/);
  url.pathname = version ? pathname.slice(0, -version[0].length) : pathname;
  const httpOptions = {
    baseUrl: url.toString().replace(/\/+$/, ''),
    apiVersion: version?.[1] ?? (vertexai ? 'v1beta1' : 'v1beta'),
  };
  if (!vertexai) return { vertexai: false, apiKey: config.apiKey, httpOptions };
  if (config.vertexAuthMode === 'api-key') {
    return { vertexai: true, apiKey: config.vertexApiKey, httpOptions };
  }
  return {
    vertexai: true,
    // Explicit project/location override any ambient API key in the SDK.
    project: config.vertexProject,
    location: config.vertexLocation,
    httpOptions,
  };
}

export function createGeminiClient(config: GeminiConnectionConfig) {
  return new GoogleGenAI(buildGeminiClientOptions(config));
}
