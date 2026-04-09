
export interface GenerateImageParams {
  prompt: string;
  aspectRatio?: "1:1" | "3:4" | "4:3" | "9:16" | "16:9" | "1:4" | "1:8" | "4:1" | "8:1";
  imageSize?: "512px" | "1K" | "2K" | "4K";
  referenceImages?: Array<{ data: string; mimeType: string; }>;
  signal?: AbortSignal;
}

export async function generateImage(params: GenerateImageParams): Promise<string> {
  const { signal: externalSignal, ...restParams } = params;
  const customKey = localStorage.getItem('custom_gemini_api_key');
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), 60000); // 60s timeout

  // Merge external signal with timeout signal
  const signals: AbortSignal[] = [timeoutController.signal];
  if (externalSignal) signals.push(externalSignal);
  const signal = AbortSignal.any ? AbortSignal.any(signals) : timeoutController.signal;

  // If external signal is already aborted before we start, register a listener
  // to propagate it to the timeout controller for environments without AbortSignal.any
  let externalAbortListener: (() => void) | undefined;
  if (externalSignal && !AbortSignal.any) {
    externalAbortListener = () => timeoutController.abort();
    externalSignal.addEventListener('abort', externalAbortListener);
  }

  try {
    const response = await fetch('/api/generate-image', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      signal,
      body: JSON.stringify({
        ...restParams,
        customKey,
      }),
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      let errorMessage = '图像生成失败';
      try {
        const text = await response.text();
        const json = JSON.parse(text);
        errorMessage = json.error || errorMessage;
      } catch {
        // non-JSON body, use default message
      }
      throw new Error(errorMessage);
    }

    const data = await response.json();
    return data.imageUrl;
  } catch (error) {
    clearTimeout(timeoutId);
    console.error("Error generating image:", error);
    throw error;
  } finally {
    if (externalSignal && externalAbortListener) {
      externalSignal.removeEventListener('abort', externalAbortListener);
    }
  }
}

export async function optimizePrompt(prompt: string): Promise<string> {
  const customKey = localStorage.getItem('custom_gemini_api_key');
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

  try {
    const response = await fetch('/api/optimize-prompt', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify({
        prompt,
        customKey,
      }),
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      let errorMessage = '提示词优化失败';
      try {
        const text = await response.text();
        const json = JSON.parse(text);
        errorMessage = json.error || errorMessage;
      } catch {
        // non-JSON body, use default message
      }
      throw new Error(errorMessage);
    }

    const data = await response.json();
    return data.optimizedPrompt;
  } catch (error) {
    clearTimeout(timeoutId);
    console.error("Error optimizing prompt:", error);
    throw error;
  }
}
