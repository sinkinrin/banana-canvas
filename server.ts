import express from "express";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import path from "path";
import dotenv from "dotenv";
import { HttpsProxyAgent } from "https-proxy-agent";

dotenv.config();

async function startServer() {
  // Proxy support: set HTTPS_PROXY or HTTP_PROXY environment variable to route
  // all outgoing Gemini API requests through a proxy.
  // Example: HTTPS_PROXY=http://127.0.0.1:7890
  const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
  if (proxyUrl) {
    console.log(`[Proxy] Using proxy: ${proxyUrl}`);
    const agent = new HttpsProxyAgent(proxyUrl);
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      return originalFetch(input, { ...(init ?? {}), agent } as RequestInit & { agent: unknown });
    };
  }

  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  // API routes FIRST
  app.post("/api/generate-image", async (req, res) => {
    try {
      const { prompt, aspectRatio, imageSize, referenceImages, referenceImage, customKey } = req.body;
      const apiKey = customKey || process.env.GEMINI_API_KEY;

      if (!apiKey) {
        return res.status(401).json({ error: "需要 API Key" });
      }

      const ai = new GoogleGenAI({ apiKey });
      const parts: any[] = [];

      // Support both old single and new array format
      const images = referenceImages || (referenceImage ? [referenceImage] : []);
      for (const img of images) {
        parts.push({ inlineData: { data: img.data, mimeType: img.mimeType } });
      }

      parts.push({ text: prompt });

      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-image-preview",
        contents: { parts },
        config: {
          imageConfig: {
            aspectRatio: aspectRatio || "1:1",
            imageSize: imageSize || "1K",
          },
        },
      });

      let imageUrl = null;
      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          imageUrl = `data:image/png;base64,${part.inlineData.data}`;
          break;
        }
      }
      
      if (!imageUrl) {
        throw new Error("响应中未找到图像数据。");
      }

      res.json({ imageUrl });
    } catch (error: any) {
      console.error("Error generating image:", error);
      res.status(500).json({ error: error.message || "图像生成失败" });
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
      server: { middlewareMode: true },
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
