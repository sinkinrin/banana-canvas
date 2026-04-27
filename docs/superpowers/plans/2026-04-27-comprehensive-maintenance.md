# Comprehensive Maintenance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename and verify Banana Canvas, split server and node workflow responsibilities into focused modules, add generation request validation, and replace native project prompts with app-owned dialogs without changing persisted project or canvas behavior.

**Architecture:** Keep public endpoints, store shape, node data, and provider request behavior stable while moving logic behind small module boundaries. Each task writes failing `node:test` or static markup tests first, implements the smallest production change, runs targeted tests, runs relevant broader tests, and commits before the next task. Coding subagents implement task commits; review subagents review each committed diff, and the controller can continue to the next task without prompting a human between tasks.

**Tech Stack:** Vite, React 19, TypeScript, Express 4, Zustand/Zundo, React Flow, lucide-react, `node:test`, `react-dom/server` static markup tests, `tsx`, npm scripts.

---

## Constraints

- Do not add `jsdom`, `happy-dom`, Testing Library, or another browser-like DOM test dependency.
- Keep endpoint paths and response shapes stable except malformed generation requests now return `400`.
- Preserve the current `referenceImages` precedence over `referenceImage`: when `referenceImages` is present, ignore `referenceImage`.
- Preserve project storage, snapshot fields, asset IDs, mask edit metadata, and model parameter behavior.
- Do not require manual human input between tasks. Review subagents review committed diffs; coding subagents continue with the next unchecked task after review feedback is resolved.
- Run commands from `C:\Users\cassi\Desktop\tools\banana`.

## File Map

- `package.json`: rename package to `banana-canvas`; add `test` and `check` scripts.
- `package-lock.json`: update root package metadata name to `banana-canvas`.
- `README.md`: document `npm test`, `npm run check`, and the updated module layout.
- `server.ts`: become thin bootstrap for env, proxy, app creation, Vite/static middleware, and listen.
- `src/server/app.ts`: create and configure the Express app with API routes.
- `src/server/projectsRoutes.ts`: mount `/api/projects` CRUD/import routes around `createLocalProjectStore`.
- `src/server/generationRoutes.ts`: mount `/api/generate-image` and `/api/optimize-prompt`, own request IDs and HTTP response shaping.
- `src/server/providers/banana.ts`: own Gemini/Banana request construction, provider call, and image extraction.
- `src/server/providers/image2.ts`: own Image2 request construction, endpoint selection, retry/fallback behavior, streaming parsing, mask handling, and URL normalization.
- `src/server/proxy.ts`: own proxy URL resolution, redaction, undici agents, env integer/boolean readers, and optional global fetch wrapping.
- `src/server/requestValidation.ts`: validate and normalize generation request bodies before provider dispatch.
- `src/components/projects/ProjectNameDialog.tsx`: app-owned create/rename project dialog.
- `src/components/projects/ConfirmDialog.tsx`: app-owned destructive confirmation dialog.
- `src/components/projects/projectDialogLogic.ts`: pure helpers for dialog defaults, submit values, cancel, and Escape decisions.
- `src/pages/ProjectsPage.tsx`: open project dialogs instead of `window.prompt`/`window.confirm`.
- `src/pages/ProjectCanvasPage.tsx`: open rename dialog instead of `window.prompt`.
- `src/components/nodes/useReferenceImages.ts`: resolve asset-backed references, read uploads/pastes, enforce four-image limit, add/remove references.
- `src/components/nodes/usePromptGeneration.ts`: own prompt generation run, abort handling, generated edges, batch count, progress, options, and prompt error updates.
- `src/components/nodes/useMaskGeneration.ts`: share Image2 mask edit generation between prompt references and image nodes.
- `src/components/nodes/useImageNodeActions.ts`: own image-node download, copy image, copy prompt, rerun, and create-reference-node handlers.
- Tests live beside the changed modules using `*.test.ts` or `*.test.tsx`.

## Task 1: Package Rename, Scripts, And README

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `README.md`
- Create: `src/lib/packageMetadata.test.ts`

- [ ] **Step 1: Write the failing metadata and README tests**

Create `src/lib/packageMetadata.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function readJson(fileName: string) {
  return JSON.parse(readFileSync(path.join(rootDir, fileName), 'utf8')) as any;
}

test('package metadata uses the Banana Canvas package name and verification scripts', () => {
  const pkg = readJson('package.json');
  const lock = readJson('package-lock.json');

  assert.equal(pkg.name, 'banana-canvas');
  assert.equal(lock.name, 'banana-canvas');
  assert.equal(lock.packages[''].name, 'banana-canvas');
  assert.equal(pkg.scripts.test, 'tsx --test "src/**/*.test.ts" "src/**/*.test.tsx"');
  assert.equal(pkg.scripts.check, 'npm run lint && npm test && npm run build');
});

test('README documents repeatable test and check commands without making install part of check', () => {
  const readme = readFileSync(path.join(rootDir, 'README.md'), 'utf8');

  assert.match(readme, /npm test/);
  assert.match(readme, /npm run check/);
  assert.match(readme, /npm install/);
  assert.doesNotMatch(readme, /"check":\s*"npm install/);
});
```

- [ ] **Step 2: Run the targeted test and verify failure**

Run:

```bash
npx tsx --test src/lib/packageMetadata.test.ts
```

Expected: FAIL because `package.json` and `package-lock.json` still use `react-example`, and scripts are missing.

- [ ] **Step 3: Implement the package and README changes**

Change `package.json`:

```json
{
  "name": "banana-canvas",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "tsx server.ts",
    "start": "tsx server.ts",
    "build": "vite build",
    "preview": "vite preview",
    "clean": "rm -rf dist",
    "lint": "tsc --noEmit",
    "test": "tsx --test \"src/**/*.test.ts\" \"src/**/*.test.tsx\"",
    "check": "npm run lint && npm test && npm run build"
  }
}
```

Keep existing dependencies, devDependencies, and overrides unchanged.

Change the top of `package-lock.json` and `packages[""]`:

```json
{
  "name": "banana-canvas",
  "version": "0.1.0",
  "lockfileVersion": 3,
  "requires": true,
  "packages": {
    "": {
      "name": "banana-canvas",
      "version": "0.1.0"
    }
  }
}
```

Keep all dependency entries unchanged.

Update README script table so it includes:

```markdown
| `npm test` | 运行 `node:test` 测试套件：`src/**/*.test.ts` 与 `src/**/*.test.tsx` |
| `npm run check` | 依次运行 TypeScript 检查、测试和生产构建；不会执行安装命令 |
```

Update README testing section to prefer:

```bash
npm test
```

and mention full verification:

```bash
npm run check
```

- [ ] **Step 4: Run targeted and relevant tests**

Run:

```bash
npm test -- src/lib/packageMetadata.test.ts
npm run lint
```

Expected: PASS for the metadata test and TypeScript check.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json README.md src/lib/packageMetadata.test.ts
git commit -m "chore: rename package and add verification scripts"
```

## Task 2: Generation Request Validation

**Files:**
- Create: `src/server/requestValidation.ts`
- Create: `src/server/requestValidation.test.ts`

- [ ] **Step 1: Write failing validation tests**

Create `src/server/requestValidation.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  validateGenerateImageRequest,
  type GenerateImageRequestBody,
} from './requestValidation';

const png = Buffer.from('valid png bytes').toString('base64');
const jpg = Buffer.from('valid jpg bytes').toString('base64');

test('rejects non-string prompt values', () => {
  const result = validateGenerateImageRequest({ prompt: 42 });

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error, 'prompt must be a string');
});

test('preserves referenceImages precedence over referenceImage', () => {
  const body: GenerateImageRequestBody = {
    prompt: 'draw',
    referenceImages: [{ data: png, mimeType: 'image/png' }],
    referenceImage: { data: jpg, mimeType: 'image/jpeg' },
  };

  const result = validateGenerateImageRequest(body);

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.value.referenceImages, [{ data: png, mimeType: 'image/png' }]);
  }
});

test('rejects more than four effective reference images', () => {
  const result = validateGenerateImageRequest({
    referenceImages: Array.from({ length: 5 }, () => ({ data: png, mimeType: 'image/png' })),
  });

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error, 'referenceImages must contain at most 4 images');
});

test('rejects malformed reference image entries', () => {
  const result = validateGenerateImageRequest({
    referenceImages: [{ data: '', mimeType: 'text/plain' }],
  });

  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /referenceImages\[0\]/);
});

test('rejects maskImage for Banana requests', () => {
  const result = validateGenerateImageRequest({
    imageModel: 'banana',
    maskImage: { data: png, mimeType: 'image/png' },
  });

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error, 'maskImage is only supported for Image2 requests');
});

test('rejects non-PNG mask payloads for Image2 requests', () => {
  const result = validateGenerateImageRequest({
    imageModel: 'image2',
    maskImage: { data: jpg, mimeType: 'image/jpeg' },
  });

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error, 'maskImage must be an image/png payload');
});

test('returns normalized provider options and effective generation fields', () => {
  const result = validateGenerateImageRequest({
    prompt: 'draw',
    imageModel: 'image2',
    aspectRatio: '16:9',
    imageSize: '1K',
    referenceImage: { data: png, mimeType: 'image/png' },
    image2Options: { quality: 'high', outputFormat: 'webp', outputCompression: 80 },
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.prompt, 'draw');
    assert.equal(result.value.imageModel, 'image2');
    assert.deepEqual(result.value.referenceImages, [{ data: png, mimeType: 'image/png' }]);
    assert.deepEqual(result.value.image2Options, {
      quality: 'high',
      outputFormat: 'webp',
      outputCompression: 80,
    });
  }
});
```

- [ ] **Step 2: Run the targeted test and verify failure**

Run:

```bash
npx tsx --test src/server/requestValidation.test.ts
```

Expected: FAIL because `src/server/requestValidation.ts` does not exist.

- [ ] **Step 3: Implement the validator**

Create `src/server/requestValidation.ts`:

```ts
import {
  getImageModelConfig,
  normalizeBananaOptions,
  normalizeImage2Options,
  normalizeImageModel,
  type BananaOptions,
  type Image2Options,
  type ImageModelId,
  type ReferenceImageInput,
} from '../lib/imageModels';

export type GenerateImageRequestBody = {
  prompt?: unknown;
  imageModel?: unknown;
  aspectRatio?: unknown;
  imageSize?: unknown;
  referenceImages?: unknown;
  referenceImage?: unknown;
  maskImage?: unknown;
  bananaOptions?: unknown;
  image2Options?: unknown;
  customKey?: unknown;
};

export type ValidGenerateImageRequest = {
  prompt: string;
  imageModel: ImageModelId;
  provider: ReturnType<typeof getImageModelConfig>['provider'];
  aspectRatio?: unknown;
  imageSize?: unknown;
  referenceImages: ReferenceImageInput[];
  maskImage?: ReferenceImageInput;
  bananaOptions: BananaOptions;
  image2Options: Image2Options;
  customKey?: string;
};

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isDecodableBase64(value: string) {
  if (!value.trim()) return false;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return false;
  try {
    return Buffer.from(value, 'base64').length > 0;
  } catch {
    return false;
  }
}

function validateImage(value: unknown, label: string): ValidationResult<ReferenceImageInput> {
  if (!isRecord(value)) return { ok: false, error: `${label} must be an object` };
  if (typeof value.data !== 'string') return { ok: false, error: `${label}.data must be a string` };
  if (typeof value.mimeType !== 'string') return { ok: false, error: `${label}.mimeType must be a string` };
  if (!value.mimeType.startsWith('image/')) return { ok: false, error: `${label}.mimeType must start with image/` };
  if (!isDecodableBase64(value.data)) return { ok: false, error: `${label}.data must be non-empty base64` };
  return { ok: true, value: { data: value.data, mimeType: value.mimeType } };
}

function collectEffectiveReferences(body: GenerateImageRequestBody): ValidationResult<ReferenceImageInput[]> {
  const rawReferences = body.referenceImages !== undefined
    ? body.referenceImages
    : body.referenceImage !== undefined
      ? [body.referenceImage]
      : [];

  if (!Array.isArray(rawReferences)) {
    return { ok: false, error: 'referenceImages must be an array' };
  }

  if (rawReferences.length > 4) {
    return { ok: false, error: 'referenceImages must contain at most 4 images' };
  }

  const references: ReferenceImageInput[] = [];
  for (const [index, rawReference] of rawReferences.entries()) {
    const result = validateImage(rawReference, `referenceImages[${index}]`);
    if (!result.ok) return result;
    references.push(result.value);
  }

  return { ok: true, value: references };
}

export function validateGenerateImageRequest(body: unknown): ValidationResult<ValidGenerateImageRequest> {
  const requestBody: GenerateImageRequestBody = isRecord(body) ? body : {};

  if (requestBody.prompt !== undefined && typeof requestBody.prompt !== 'string') {
    return { ok: false, error: 'prompt must be a string' };
  }

  const imageModel = normalizeImageModel(requestBody.imageModel);
  const modelConfig = getImageModelConfig(imageModel);
  const references = collectEffectiveReferences(requestBody);
  if (!references.ok) return references;

  let maskImage: ReferenceImageInput | undefined;
  if (requestBody.maskImage !== undefined) {
    if (modelConfig.provider !== 'openai-chat') {
      return { ok: false, error: 'maskImage is only supported for Image2 requests' };
    }

    const maskResult = validateImage(requestBody.maskImage, 'maskImage');
    if (!maskResult.ok) return maskResult;
    if (maskResult.value.mimeType !== 'image/png') {
      return { ok: false, error: 'maskImage must be an image/png payload' };
    }
    maskImage = maskResult.value;
  }

  return {
    ok: true,
    value: {
      prompt: requestBody.prompt ?? '',
      imageModel,
      provider: modelConfig.provider,
      aspectRatio: requestBody.aspectRatio,
      imageSize: requestBody.imageSize,
      referenceImages: references.value,
      maskImage,
      bananaOptions: normalizeBananaOptions(requestBody.bananaOptions),
      image2Options: normalizeImage2Options(requestBody.image2Options),
      customKey: typeof requestBody.customKey === 'string' ? requestBody.customKey : undefined,
    },
  };
}
```

- [ ] **Step 4: Run targeted and relevant tests**

Run:

```bash
npx tsx --test src/server/requestValidation.test.ts
npm run lint
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/requestValidation.ts src/server/requestValidation.test.ts
git commit -m "feat: validate generation requests"
```

## Task 3: Generation Routes Use Validation And Return 400 Before Providers

**Files:**
- Create: `src/server/generationRoutes.ts`
- Create: `src/server/generationRoutes.test.ts`
- Modify: `server.ts`

- [ ] **Step 1: Write failing route tests**

Create `src/server/generationRoutes.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';

import { mountGenerationRoutes, type GenerationProviders } from './generationRoutes';

async function requestJson(app: express.Express, path: string, body: unknown) {
  const server = app.listen(0);
  await once(server, 'listening');
  const address = server.address();
  assert.equal(typeof address, 'object');
  assert.ok(address);

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return {
      status: response.status,
      body: await response.json() as any,
    };
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

function createApp(providers: GenerationProviders) {
  const app = express();
  app.use(express.json({ limit: '50mb' }));
  mountGenerationRoutes(app, { providers });
  return app;
}

test('generate-image returns 400 for validation failures without calling providers', async () => {
  let called = false;
  const app = createApp({
    generateBananaImage: async () => {
      called = true;
      return 'data:image/png;base64,banana';
    },
    generateImage2Image: async () => {
      called = true;
      return 'data:image/png;base64,image2';
    },
    optimizePrompt: async () => 'optimized',
  });

  const response = await requestJson(app, '/api/generate-image', { prompt: 42 });

  assert.equal(response.status, 400);
  assert.equal(response.body.error, 'prompt must be a string');
  assert.equal(called, false);
});

test('generate-image returns provider result for valid Banana request', async () => {
  const app = createApp({
    generateBananaImage: async ({ prompt, images }) => {
      assert.equal(prompt, 'draw');
      assert.equal(images.length, 0);
      return 'data:image/png;base64,banana';
    },
    generateImage2Image: async () => {
      throw new Error('Image2 should not be called');
    },
    optimizePrompt: async () => 'optimized',
  });

  const response = await requestJson(app, '/api/generate-image', {
    prompt: 'draw',
    imageModel: 'banana',
    customKey: 'test-key',
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    imageUrl: 'data:image/png;base64,banana',
    imageModel: 'banana',
  });
});

test('provider failures still return 500 with a request ID', async () => {
  const app = createApp({
    generateBananaImage: async () => {
      throw new Error('provider exploded');
    },
    generateImage2Image: async () => 'data:image/png;base64,image2',
    optimizePrompt: async () => 'optimized',
  });

  const response = await requestJson(app, '/api/generate-image', {
    prompt: 'draw',
    imageModel: 'banana',
    customKey: 'test-key',
  });

  assert.equal(response.status, 500);
  assert.match(response.body.error, /provider exploded/);
  assert.equal(typeof response.body.requestId, 'string');
});

test('optimize-prompt returns stable response shape through injected optimizer without image providers', async () => {
  let imageProviderCalled = false;
  const app = createApp({
    generateBananaImage: async () => {
      imageProviderCalled = true;
      return 'data:image/png;base64,banana';
    },
    generateImage2Image: async () => {
      imageProviderCalled = true;
      return 'data:image/png;base64,image2';
    },
    optimizePrompt: async ({ prompt }) => {
      assert.equal(prompt, 'short prompt');
      return 'expanded prompt';
    },
  });

  const response = await requestJson(app, '/api/optimize-prompt', { prompt: 'short prompt', customKey: 'test-key' });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { optimizedPrompt: 'expanded prompt' });
  assert.equal(imageProviderCalled, false);
});
```

- [ ] **Step 2: Run targeted route tests and verify failure**

Run:

```bash
npx tsx --test src/server/generationRoutes.test.ts
```

Expected: FAIL because `src/server/generationRoutes.ts` does not exist.

- [ ] **Step 3: Implement generation route mounting with provider injection**

Create `src/server/generationRoutes.ts` with this interface and routing shape:

```ts
import express from 'express';
import { GoogleGenAI } from '@google/genai';
import {
  validateGenerateImageRequest,
  type ValidGenerateImageRequest,
} from './requestValidation';
import type { BananaOptions, Image2Options, ReferenceImageInput } from '../lib/imageModels';

export type BananaGenerateInput = {
  prompt: string;
  apiKey: string;
  aspectRatio?: unknown;
  imageSize?: unknown;
  images: ReferenceImageInput[];
  bananaOptions: BananaOptions;
};

export type Image2GenerateInput = {
  requestId: string;
  prompt: string;
  aspectRatio?: unknown;
  imageSize?: unknown;
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
    } catch (error: any) {
      const message = error.message || '图像生成失败';
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
    } catch (error: any) {
      console.error('Error optimizing prompt:', error);
      res.status(500).json({ error: error.message || '提示词优化失败' });
    }
  });
}
```

In `server.ts`, replace the inline `/api/generate-image` and `/api/optimize-prompt` handlers with `mountGenerationRoutes(app, { providers: { generateBananaImage, generateImage2Image } })`. Keep the existing local provider functions in `server.ts` until Task 4 moves them.

- [ ] **Step 4: Run targeted and relevant tests**

Run:

```bash
npx tsx --test src/server/requestValidation.test.ts src/server/generationRoutes.test.ts
npm run lint
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server.ts src/server/generationRoutes.ts src/server/generationRoutes.test.ts
git commit -m "feat: route generation through validation"
```

## Task 4: Provider And Proxy Module Extraction

**Files:**
- Create: `src/server/proxy.ts`
- Create: `src/server/proxy.test.ts`
- Create: `src/server/providers/banana.ts`
- Create: `src/server/providers/banana.test.ts`
- Create: `src/server/providers/image2.ts`
- Create: `src/server/providers/image2.test.ts`
- Modify: `server.ts`
- Modify: `src/server/generationRoutes.ts`

- [ ] **Step 1: Write failing proxy and provider tests**

Create `src/server/proxy.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getConfiguredProxyUrl,
  readBooleanEnv,
  readNonNegativeIntEnv,
  readPositiveIntEnv,
  redactProxyUrl,
} from './proxy';

test('redactProxyUrl hides credentials while preserving host details', () => {
  assert.equal(
    redactProxyUrl('http://user:secret@127.0.0.1:7890'),
    'http://***:***@127.0.0.1:7890/'
  );
});

test('env readers clamp invalid and out-of-range values', () => {
  assert.equal(readPositiveIntEnv({ VALUE: '0' }, 'VALUE', 5), 5);
  assert.equal(readPositiveIntEnv({ VALUE: '12.8' }, 'VALUE', 5, 10), 10);
  assert.equal(readNonNegativeIntEnv({ VALUE: '-1' }, 'VALUE', 2), 2);
  assert.equal(readNonNegativeIntEnv({ VALUE: '3.9' }, 'VALUE', 2), 3);
  assert.equal(readBooleanEnv({ VALUE: 'yes' }, 'VALUE'), true);
  assert.equal(readBooleanEnv({ VALUE: '0' }, 'VALUE', true), false);
});

test('getConfiguredProxyUrl prefers image2-specific proxy', () => {
  assert.equal(
    getConfiguredProxyUrl({
      IMAGE2_HTTPS_PROXY: 'http://image2-proxy',
      HTTPS_PROXY: 'http://https-proxy',
      HTTP_PROXY: 'http://http-proxy',
    }),
    'http://image2-proxy'
  );
});
```

Create `src/server/providers/image2.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  base64ToBlob,
  buildImage2MultipartRequest,
  extractImage2GeneratedUrl,
  fetchImage2WithNetworkFallback,
  getImage2AttemptPlan,
  parseImage2SseEvents,
  previewResponseBody,
  selectImage2Endpoint,
  toImage2Size,
} from './image2';

test('toImage2Size preserves existing aspect and size mapping', () => {
  assert.equal(toImage2Size('16:9', '1K'), '1536x1024');
  assert.equal(toImage2Size('9:16', '1K'), '1024x1536');
  assert.equal(toImage2Size('1:1', '512px'), '1024x1024');
  assert.equal(toImage2Size(undefined, undefined), '1024x1024');
});

test('previewResponseBody truncates long relay responses', () => {
  assert.equal(previewResponseBody('a'.repeat(501)), `${'a'.repeat(500)}...`);
});

test('base64ToBlob creates a Blob with the source MIME type', async () => {
  const blob = base64ToBlob({
    data: Buffer.from('image bytes').toString('base64'),
    mimeType: 'image/webp',
  });

  assert.equal(blob.type, 'image/webp');
  assert.equal(await blob.text(), 'image bytes');
});

test('selectImage2Endpoint chooses edit endpoint when references or mask are present', () => {
  assert.equal(selectImage2Endpoint({ referenceCount: 0, hasMask: false }), '/v1/images/generations');
  assert.equal(selectImage2Endpoint({ referenceCount: 1, hasMask: false }), '/v1/images/edits');
  assert.equal(selectImage2Endpoint({ referenceCount: 0, hasMask: true }), '/v1/images/edits');
});

test('getImage2AttemptPlan preserves proxy-direct fallback order', () => {
  assert.deepEqual(
    getImage2AttemptPlan({ proxyMode: 'auto', hasProxy: true }),
    [
      { label: 'proxy', useProxy: true },
      { label: 'direct', useProxy: false },
    ]
  );
  assert.deepEqual(getImage2AttemptPlan({ proxyMode: 'direct', hasProxy: true }), [{ label: 'direct', useProxy: false }]);
  assert.deepEqual(getImage2AttemptPlan({ proxyMode: 'proxy', hasProxy: true }), [{ label: 'proxy', useProxy: true }]);
});

test('parseImage2SseEvents extracts generated image URLs from streaming events', () => {
  assert.deepEqual(
    parseImage2SseEvents([
      'data: {"type":"response.output_text.delta","delta":"ignored"}',
      'data: {"type":"response.image_generation.completed","image_url":"https://example.test/generated.png"}',
      'data: [DONE]',
    ].join('\n\n')),
    [{ type: 'response.image_generation.completed', image_url: 'https://example.test/generated.png' }]
  );
});

test('extractImage2GeneratedUrl normalizes generated URL and data URL responses', () => {
  assert.equal(
    extractImage2GeneratedUrl({ data: [{ url: '/files/generated.png' }] }, 'https://api.openai.com'),
    'https://api.openai.com/files/generated.png'
  );
  assert.equal(
    extractImage2GeneratedUrl({ data: [{ b64_json: 'abc' }] }, 'https://api.openai.com'),
    'data:image/png;base64,abc'
  );
});

test('buildImage2MultipartRequest includes mask and edit references in request construction', async () => {
  const request = buildImage2MultipartRequest({
    prompt: 'replace hat',
    size: '1024x1024',
    responseFormat: 'url',
    outputFormat: 'png',
    outputCompression: 90,
    referenceImages: [{ data: Buffer.from('source').toString('base64'), mimeType: 'image/png' }],
    maskImage: { data: Buffer.from('mask').toString('base64'), mimeType: 'image/png' },
  });

  assert.equal(request.method, 'POST');
  assert.equal(request.endpoint, '/v1/images/edits');
  assert.equal(request.body.get('prompt'), 'replace hat');
  assert.equal(request.body.get('size'), '1024x1024');
  assert.equal(request.body.get('response_format'), 'url');
  assert.equal(request.body.getAll('image').length, 1);
  assert.ok(request.body.get('mask'));
});

test('fetchImage2WithNetworkFallback consumes attempt plan through injected fetch without network', async () => {
  const calls: Array<{ label: string; dispatcher: unknown }> = [];
  const proxyDispatcher = { name: 'proxy-dispatcher' };
  const directDispatcher = { name: 'direct-dispatcher' };

  const response = await fetchImage2WithNetworkFallback({
    url: 'https://api.openai.com/v1/images/generations',
    init: { method: 'POST', body: JSON.stringify({ prompt: 'draw' }) },
    attempts: getImage2AttemptPlan({ proxyMode: 'auto', hasProxy: true }),
    fetchImpl: async (_url, init, attempt) => {
      calls.push({ label: attempt.label, dispatcher: (init as any).dispatcher });
      if (attempt.label === 'proxy') throw new TypeError('proxy failed');
      return new Response(JSON.stringify({ data: [{ b64_json: 'abc' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
    getProxyDispatcher: () => proxyDispatcher,
    getDirectDispatcher: () => directDispatcher,
  });

  assert.equal(response.status, 200);
  assert.deepEqual(calls, [
    { label: 'proxy', dispatcher: proxyDispatcher },
    { label: 'direct', dispatcher: directDispatcher },
  ]);
});

test('fetchImage2WithNetworkFallback honors direct-only and proxy-only attempt modes', async () => {
  const directCalls: string[] = [];
  await fetchImage2WithNetworkFallback({
    url: 'https://api.openai.com/v1/images/generations',
    init: { method: 'POST' },
    attempts: getImage2AttemptPlan({ proxyMode: 'direct', hasProxy: true }),
    fetchImpl: async (_url, _init, attempt) => {
      directCalls.push(attempt.label);
      return new Response('{}', { status: 200 });
    },
    getProxyDispatcher: () => ({ name: 'proxy' }),
    getDirectDispatcher: () => ({ name: 'direct' }),
  });

  const proxyCalls: string[] = [];
  await fetchImage2WithNetworkFallback({
    url: 'https://api.openai.com/v1/images/generations',
    init: { method: 'POST' },
    attempts: getImage2AttemptPlan({ proxyMode: 'proxy', hasProxy: true }),
    fetchImpl: async (_url, _init, attempt) => {
      proxyCalls.push(attempt.label);
      return new Response('{}', { status: 200 });
    },
    getProxyDispatcher: () => ({ name: 'proxy' }),
    getDirectDispatcher: () => ({ name: 'direct' }),
  });

  assert.deepEqual(directCalls, ['direct']);
  assert.deepEqual(proxyCalls, ['proxy']);
});
```

Create `src/server/providers/banana.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildBananaProviderRequest,
  extractBananaProviderImageUrl,
} from './banana';

test('buildBananaProviderRequest preserves prompt, model options, and inline references', () => {
  const request = buildBananaProviderRequest({
    prompt: 'draw',
    aspectRatio: '16:9',
    imageSize: '1K',
    images: [{ data: Buffer.from('ref').toString('base64'), mimeType: 'image/png' }],
    bananaOptions: { thinkingLevel: 'HIGH' },
  }) as any;

  assert.equal(request.model, 'gemini-3.1-flash-image-preview');
  assert.equal(request.contents.parts[0].inlineData.mimeType, 'image/png');
  assert.equal(request.contents.parts[1].text, 'draw');
  assert.equal(request.config.imageConfig.aspectRatio, '16:9');
  assert.equal(request.config.imageConfig.imageSize, '1K');
  assert.equal(request.config.thinkingConfig.thinkingLevel, 'HIGH');
});

test('extractBananaProviderImageUrl returns a data URL from provider image parts', () => {
  assert.equal(
    extractBananaProviderImageUrl({
      candidates: [{
        content: {
          parts: [{ inlineData: { mimeType: 'image/png', data: 'abc' } }],
        },
      }],
    }),
    'data:image/png;base64,abc'
  );
});
```

- [ ] **Step 2: Run targeted tests and verify failure**

Run:

```bash
npx tsx --test src/server/proxy.test.ts src/server/providers/banana.test.ts src/server/providers/image2.test.ts src/lib/imageModels.test.ts
```

Expected: FAIL because the new modules do not exist.

- [ ] **Step 3: Extract proxy helpers**

Create `src/server/proxy.ts`:

```ts
import { Agent, ProxyAgent } from 'undici';
import {
  resolveImage2AllowH2,
  resolveImage2ProxyMode,
} from '../lib/imageModels';

export type FetchInitWithDispatcher = RequestInit & { dispatcher?: unknown };
export type EnvLike = Record<string, string | undefined>;

export const DEFAULT_IMAGE2_REQUEST_TIMEOUT_MS = 240_000;
export const DEFAULT_IMAGE2_PROXY_CONNECT_TIMEOUT_MS = 60_000;

let proxyAgent: ProxyAgent | null = null;
let proxyAgentUrl = '';
let image2DirectAgent: Agent | null = null;

export function getConfiguredProxyUrl(env: EnvLike = process.env) {
  return env.IMAGE2_HTTPS_PROXY || env.HTTPS_PROXY || env.HTTP_PROXY || '';
}

export function getImage2ProxyMode(proxyUrl = getConfiguredProxyUrl(), env: EnvLike = process.env) {
  return resolveImage2ProxyMode(env.IMAGE2_PROXY_MODE, Boolean(proxyUrl));
}

export function readPositiveIntEnv(
  env: EnvLike,
  name: string,
  fallback: number,
  max = Number.MAX_SAFE_INTEGER
) {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.min(Math.floor(value), max);
}

export function readNonNegativeIntEnv(
  env: EnvLike,
  name: string,
  fallback: number,
  max = Number.MAX_SAFE_INTEGER
) {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return fallback;
  return Math.min(Math.floor(value), max);
}

export function readBooleanEnv(env: EnvLike, name: string, fallback = false) {
  const normalized = env[name]?.trim().toLowerCase();
  if (!normalized) return fallback;
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
  if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
  return fallback;
}

export function redactProxyUrl(proxyUrl: string) {
  try {
    const url = new URL(proxyUrl);
    if (url.username) url.username = '***';
    if (url.password) url.password = '***';
    return url.toString();
  } catch {
    return '[invalid proxy url]';
  }
}

export function getProxyAgent(proxyUrl: string, env: EnvLike = process.env) {
  if (!proxyAgent || proxyAgentUrl !== proxyUrl) {
    proxyAgent = new ProxyAgent({
      uri: proxyUrl,
      connectTimeout: readPositiveIntEnv(env, 'IMAGE2_PROXY_CONNECT_TIMEOUT_MS', DEFAULT_IMAGE2_PROXY_CONNECT_TIMEOUT_MS),
      headersTimeout: readPositiveIntEnv(env, 'IMAGE2_REQUEST_TIMEOUT_MS', DEFAULT_IMAGE2_REQUEST_TIMEOUT_MS),
      bodyTimeout: readPositiveIntEnv(env, 'IMAGE2_REQUEST_TIMEOUT_MS', DEFAULT_IMAGE2_REQUEST_TIMEOUT_MS),
    });
    proxyAgentUrl = proxyUrl;
  }
  return proxyAgent;
}

export function getImage2DirectAgent(env: EnvLike = process.env) {
  const requestTimeoutMs = readPositiveIntEnv(env, 'IMAGE2_REQUEST_TIMEOUT_MS', DEFAULT_IMAGE2_REQUEST_TIMEOUT_MS);
  const connectTimeoutMs = readPositiveIntEnv(env, 'IMAGE2_DIRECT_CONNECT_TIMEOUT_MS', DEFAULT_IMAGE2_PROXY_CONNECT_TIMEOUT_MS);
  const allowH2 = resolveImage2AllowH2(env.IMAGE2_DIRECT_ALLOW_H2);

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

export function applyGlobalProxyFetch({
  proxyUrl,
  directFetch = globalThis.fetch.bind(globalThis),
}: {
  proxyUrl: string;
  directFetch?: typeof fetch;
}) {
  const agent = getProxyAgent(proxyUrl);
  globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    return directFetch(input, { ...(init ?? {}), dispatcher: agent } as FetchInitWithDispatcher);
  };
}
```

Update existing call sites to use `readPositiveIntEnv(process.env, name, fallback)` and `readBooleanEnv(process.env, name)`.

- [ ] **Step 4: Extract Banana provider**

Create `src/server/providers/banana.ts`. Export `buildBananaProviderRequest` and `extractBananaProviderImageUrl` so request construction and provider response extraction remain covered without live Gemini calls:

```ts
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
```

- [ ] **Step 5: Extract Image2 provider**

Create `src/server/providers/image2.ts` by moving the existing Image2-specific code from `server.ts` without changing behavior. Export these helpers for tests, and use them inside `generateImage2Image` instead of duplicating endpoint, retry, parsing, URL, or multipart logic:

```ts
export function selectImage2Endpoint({
  referenceCount,
  hasMask,
}: {
  referenceCount: number;
  hasMask: boolean;
}) {
  return referenceCount > 0 || hasMask ? '/v1/images/edits' : '/v1/images/generations';
}

export function getImage2AttemptPlan({
  proxyMode,
  hasProxy,
}: {
  proxyMode: Image2ProxyMode;
  hasProxy: boolean;
}) {
  if (proxyMode === 'direct' || !hasProxy) return [{ label: 'direct' as const, useProxy: false }];
  if (proxyMode === 'proxy') return [{ label: 'proxy' as const, useProxy: true }];
  return [
    { label: 'proxy' as const, useProxy: true },
    { label: 'direct' as const, useProxy: false },
  ];
}

export function parseImage2SseEvents(body: string) {
  return body
    .split(/\n\n+/)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.startsWith('data: '))
    .map((chunk) => chunk.slice('data: '.length).trim())
    .filter((chunk) => chunk && chunk !== '[DONE]')
    .map((chunk) => JSON.parse(chunk) as Record<string, unknown>);
}

export function extractImage2GeneratedUrl(responseBody: unknown, baseUrl: string) {
  const first = Array.isArray((responseBody as any)?.data) ? (responseBody as any).data[0] : undefined;
  if (typeof first?.b64_json === 'string') return `data:image/png;base64,${first.b64_json}`;
  if (typeof first?.url === 'string') return new URL(first.url, baseUrl).toString();
  throw new Error('响应中未找到图像 URL。');
}

export function buildImage2MultipartRequest({
  prompt,
  size,
  responseFormat,
  outputFormat,
  outputCompression,
  referenceImages,
  maskImage,
}: {
  prompt: string;
  size: string;
  responseFormat?: string;
  outputFormat?: string;
  outputCompression?: number;
  referenceImages: ReferenceImageInput[];
  maskImage?: ReferenceImageInput;
}) {
  const body = new FormData();
  body.set('prompt', prompt);
  body.set('size', size);
  if (responseFormat) body.set('response_format', responseFormat);
  if (outputFormat) body.set('output_format', outputFormat);
  if (typeof outputCompression === 'number') body.set('output_compression', String(outputCompression));
  for (const reference of referenceImages) body.append('image', base64ToBlob(reference), 'reference.png');
  if (maskImage) body.set('mask', base64ToBlob(maskImage), 'mask.png');
  return { endpoint: selectImage2Endpoint({ referenceCount: referenceImages.length, hasMask: Boolean(maskImage) }), method: 'POST' as const, body };
}

export function previewResponseBody(text: string) {
  return text.length > 500 ? `${text.slice(0, 500)}...` : text;
}

export function toImage2Size(aspectRatio?: string, imageSize?: string) {
  if (aspectRatio === '16:9') return '1536x1024';
  if (aspectRatio === '9:16') return '1024x1536';
  if (aspectRatio === '4:3') return '1536x1024';
  if (aspectRatio === '3:4') return '1024x1536';
  if (imageSize === '512px' || imageSize === '512') return '1024x1024';
  return '1024x1024';
}

export function base64ToBlob(image: ReferenceImageInput) {
  const binary = Buffer.from(image.data, 'base64');
  return new Blob([binary], { type: image.mimeType || 'image/png' });
}

export type Image2Attempt = ReturnType<typeof getImage2AttemptPlan>[number];

export async function fetchImage2WithNetworkFallback({
  url,
  init,
  attempts,
  fetchImpl = async (requestUrl, requestInit) => fetch(requestUrl, requestInit),
  getProxyDispatcher,
  getDirectDispatcher,
}: {
  url: string;
  init: RequestInit;
  attempts: Image2Attempt[];
  fetchImpl?: (url: string, init: RequestInit & { dispatcher?: unknown }, attempt: Image2Attempt) => Promise<Response>;
  getProxyDispatcher: () => unknown;
  getDirectDispatcher: () => unknown;
}) {
  let lastError: unknown;
  for (const attempt of attempts) {
    const dispatcher = attempt.useProxy ? getProxyDispatcher() : getDirectDispatcher();
    try {
      return await fetchImpl(url, { ...init, dispatcher }, attempt);
    } catch (error) {
      lastError = error;
      if (attempt === attempts[attempts.length - 1]) throw error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Image2 request failed');
}
```

The exported `generateImage2Image` signature must match `Image2GenerateInput` from `generationRoutes.ts`. Keep the existing retry constants, `IMAGE2_HEDGED_CANCEL_REASON`, `fetchImage2WithNetworkFallback`, SSE parsing, generated URL normalization, multipart mask handling, and error messages unchanged. `fetchImage2WithNetworkFallback` must consume `getImage2AttemptPlan`, so tests can prove proxy-first and direct fallback behavior without real network calls.

- [ ] **Step 6: Wire extracted providers**

In `server.ts`, import:

```ts
import { generateBananaImage } from './src/server/providers/banana';
import { generateImage2Image } from './src/server/providers/image2';
import {
  applyGlobalProxyFetch,
  getConfiguredProxyUrl,
  getImage2ProxyMode,
  redactProxyUrl,
} from './src/server/proxy';
```

Delete the moved provider/proxy helper definitions from `server.ts`. Keep route wiring:

```ts
mountGenerationRoutes(app, {
  providers: {
    generateBananaImage,
    generateImage2Image,
  },
});
```

Use:

```ts
const proxyUrl = getConfiguredProxyUrl();
const image2ProxyMode = getImage2ProxyMode(proxyUrl);
if (proxyUrl) {
  console.log(`[Proxy] Using proxy: ${redactProxyUrl(proxyUrl)} image2Mode=${image2ProxyMode}`);
  applyGlobalProxyFetch({ proxyUrl });
}
```

- [ ] **Step 7: Run targeted and relevant tests**

Run:

```bash
npx tsx --test src/server/proxy.test.ts src/server/providers/banana.test.ts src/server/providers/image2.test.ts src/server/generationRoutes.test.ts src/lib/imageModels.test.ts
npm run lint
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add server.ts src/server/proxy.ts src/server/proxy.test.ts src/server/providers/banana.ts src/server/providers/banana.test.ts src/server/providers/image2.ts src/server/providers/image2.test.ts src/server/generationRoutes.ts
git commit -m "refactor: extract generation providers and proxy helpers"
```

## Task 5: Project Routes, App Factory, And Thin Bootstrap

**Files:**
- Create: `src/server/projectsRoutes.ts`
- Create: `src/server/projectsRoutes.test.ts`
- Create: `src/server/app.ts`
- Modify: `server.ts`
- Modify: `README.md`

- [ ] **Step 1: Write failing project route tests**

Create `src/server/projectsRoutes.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';

import { mountProjectRoutes } from './projectsRoutes';
import { createLocalProjectStore } from '../lib/localProjectStore';

async function withServer(app: express.Express, run: (baseUrl: string) => Promise<void>) {
  const server = app.listen(0);
  await once(server, 'listening');
  const address = server.address();
  assert.equal(typeof address, 'object');
  assert.ok(address);
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test('project routes create, rename, load, list, and delete local projects', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'banana-project-routes-'));
  try {
    const app = express();
    app.use(express.json({ limit: '50mb' }));
    mountProjectRoutes(app, createLocalProjectStore(dir));

    await withServer(app, async (baseUrl) => {
      const created = await fetch(`${baseUrl}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: ' First ', snapshot: { nodes: [], edges: [], assets: {} } }),
      });
      assert.equal(created.status, 200);
      const createdBody = await created.json() as any;
      assert.deepEqual(Object.keys(createdBody).sort(), ['project']);
      assert.equal(createdBody.project.name, 'First');

      const listed = await fetch(`${baseUrl}/api/projects`);
      assert.equal(listed.status, 200);
      const listedBody = await listed.json() as any;
      assert.ok(Array.isArray(listedBody.projects));
      assert.equal(listedBody.projects[0].id, createdBody.project.id);

      const renamed = await fetch(`${baseUrl}/api/projects/${createdBody.project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: ' Renamed ' }),
      });
      assert.equal(renamed.status, 200);
      const renamedBody = await renamed.json() as any;
      assert.deepEqual(Object.keys(renamedBody).sort(), ['project']);
      assert.equal(renamedBody.project.name, 'Renamed');

      const saved = await fetch(`${baseUrl}/api/projects/${createdBody.project.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nodes: [{ id: 'node-1', type: 'promptNode', position: { x: 0, y: 0 }, data: { prompt: 'draw' } }],
          edges: [],
          assets: {},
        }),
      });
      assert.equal(saved.status, 200);
      assert.deepEqual(await saved.json(), { ok: true });

      const loaded = await fetch(`${baseUrl}/api/projects/${createdBody.project.id}`);
      assert.equal(loaded.status, 200);
      const loadedBody = await loaded.json() as any;
      assert.equal(loadedBody.project.name, 'Renamed');
      assert.equal(loadedBody.snapshot.nodes[0].id, 'node-1');

      const imported = await fetch(`${baseUrl}/api/projects/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projects: [{
            project: {
              id: 'imported-project',
              name: 'Imported',
              createdAt: '2026-04-27T00:00:00.000Z',
              updatedAt: '2026-04-27T00:00:00.000Z',
            },
            snapshot: { nodes: [], edges: [], assets: {} },
          }],
        }),
      });
      assert.equal(imported.status, 200);
      assert.deepEqual(await imported.json(), { ok: true });

      const listAfterImport = await fetch(`${baseUrl}/api/projects`);
      const listAfterImportBody = await listAfterImport.json() as any;
      assert.equal(listAfterImportBody.projects.some((project: any) => project.id === 'imported-project'), true);

      const deleted = await fetch(`${baseUrl}/api/projects/${createdBody.project.id}`, { method: 'DELETE' });
      assert.equal(deleted.status, 200);
      assert.deepEqual(await deleted.json(), { ok: true });

      const missing = await fetch(`${baseUrl}/api/projects/${createdBody.project.id}`);
      assert.equal(missing.status, 404);
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run targeted tests and verify failure**

Run:

```bash
npx tsx --test src/server/projectsRoutes.test.ts
```

Expected: FAIL because `src/server/projectsRoutes.ts` does not exist.

- [ ] **Step 3: Implement project route mounting**

Create `src/server/projectsRoutes.ts`:

```ts
import express from 'express';
import type { LocalProjectStore } from '../lib/localProjectStore';

function sendProjectRouteError(res: express.Response, error: unknown) {
  const message = error instanceof Error ? error.message : '本地项目存储失败';
  const status = message.includes('Invalid project id')
    ? 400
    : message.includes('Project not found')
      ? 404
      : 500;
  res.status(status).json({ error: message });
}

export function mountProjectRoutes(app: express.Express, projectStore: LocalProjectStore) {
  app.get('/api/projects', async (_req, res) => {
    try {
      res.json({ projects: await projectStore.loadProjectIndex() });
    } catch (error) {
      sendProjectRouteError(res, error);
    }
  });

  app.post('/api/projects', async (req, res) => {
    try {
      const name = typeof req.body?.name === 'string' ? req.body.name : '未命名项目';
      const project = await projectStore.createProject(name, req.body?.snapshot);
      res.json({ project });
    } catch (error) {
      sendProjectRouteError(res, error);
    }
  });

  app.post('/api/projects/import', async (req, res) => {
    try {
      const projects = Array.isArray(req.body?.projects) ? req.body.projects : [];
      await projectStore.importProjects(projects);
      res.json({ ok: true });
    } catch (error) {
      sendProjectRouteError(res, error);
    }
  });

  app.get('/api/projects/:projectId', async (req, res) => {
    try {
      const project = await projectStore.loadProject(req.params.projectId);
      if (!project) {
        res.status(404).json({ error: '项目不存在' });
        return;
      }
      res.json(project);
    } catch (error) {
      sendProjectRouteError(res, error);
    }
  });

  app.put('/api/projects/:projectId', async (req, res) => {
    try {
      await projectStore.saveProjectSnapshot(req.params.projectId, req.body);
      res.json({ ok: true });
    } catch (error) {
      sendProjectRouteError(res, error);
    }
  });

  app.patch('/api/projects/:projectId', async (req, res) => {
    try {
      const name = typeof req.body?.name === 'string' ? req.body.name : '';
      const project = await projectStore.renameProject(req.params.projectId, name);
      if (!project) {
        res.status(404).json({ error: '项目不存在' });
        return;
      }
      res.json({ project });
    } catch (error) {
      sendProjectRouteError(res, error);
    }
  });

  app.delete('/api/projects/:projectId', async (req, res) => {
    try {
      await projectStore.deleteProject(req.params.projectId);
      res.json({ ok: true });
    } catch (error) {
      sendProjectRouteError(res, error);
    }
  });
}
```

If `LocalProjectStore` is not exported, add this type export to `src/lib/localProjectStore.ts`:

```ts
export type LocalProjectStore = ReturnType<typeof createLocalProjectStore>;
```

- [ ] **Step 4: Create app factory and reduce bootstrap**

Create `src/server/app.ts`:

```ts
import express from 'express';
import { createLocalProjectStore } from '../lib/localProjectStore';
import { mountGenerationRoutes, type GenerationProviders } from './generationRoutes';
import { mountProjectRoutes } from './projectsRoutes';

export function createApp({
  dataDir,
  providers,
}: {
  dataDir: string;
  providers: GenerationProviders;
}) {
  const app = express();
  app.use(express.json({ limit: '50mb' }));
  mountProjectRoutes(app, createLocalProjectStore(dataDir));
  mountGenerationRoutes(app, { providers });
  return app;
}
```

Rewrite `server.ts` so it only imports env/bootstrap dependencies, computes `getLocalDataDir()`, applies proxy fetch, calls `createApp`, attaches Vite middleware or static assets, and listens:

```ts
import path from 'path';
import dotenv from 'dotenv';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { getLocalDataWatchIgnoreGlobs } from './src/lib/devServerWatch';
import { createApp } from './src/server/app';
import { generateBananaImage } from './src/server/providers/banana';
import { generateImage2Image } from './src/server/providers/image2';
import {
  applyGlobalProxyFetch,
  getConfiguredProxyUrl,
  getImage2ProxyMode,
  redactProxyUrl,
} from './src/server/proxy';

dotenv.config();

function getLocalDataDir() {
  const configured = process.env.BANANA_DATA_DIR?.trim();
  return configured ? path.resolve(configured) : path.join(process.cwd(), 'data');
}

async function startServer() {
  const proxyUrl = getConfiguredProxyUrl();
  const image2ProxyMode = getImage2ProxyMode(proxyUrl);
  if (proxyUrl) {
    console.log(`[Proxy] Using proxy: ${redactProxyUrl(proxyUrl)} image2Mode=${image2ProxyMode}`);
    applyGlobalProxyFetch({ proxyUrl });
  }

  const app = createApp({
    dataDir: getLocalDataDir(),
    providers: {
      generateBananaImage,
      generateImage2Image,
    },
  });
  const PORT = Number(process.env.PORT || 3000);

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        watch: {
          ignored: getLocalDataWatchIgnoreGlobs(),
        },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
```

- [ ] **Step 5: Update README architecture listing**

In README's main directory tree, replace the single `server.ts` description with entries for `server.ts` and `src/server/`:

```text
├─ src/
│  ├─ server/
│  │  ├─ app.ts                   # Express app factory and API route mounting
│  │  ├─ projectsRoutes.ts        # 本地项目 CRUD/import API
│  │  ├─ generationRoutes.ts      # 生图与提示词优化 API
│  │  ├─ requestValidation.ts     # 生图请求校验与规范化
│  │  ├─ proxy.ts                 # 代理、undici agent 与 fetch 包装
│  │  └─ providers/               # Banana 与 Image2 provider 调用
├─ server.ts                       # 环境加载、Vite/static 中间件和监听入口
```

- [ ] **Step 6: Run targeted and relevant tests**

Run:

```bash
npx tsx --test src/server/projectsRoutes.test.ts src/server/generationRoutes.test.ts src/server/proxy.test.ts src/server/providers/banana.test.ts src/server/providers/image2.test.ts src/lib/imageModels.test.ts
npm run lint
```

Expected: PASS.

This test is the public endpoint stability coverage for `GET /api/projects`, `POST /api/projects`, `POST /api/projects/import`, `GET /api/projects/:projectId`, `PUT /api/projects/:projectId`, `PATCH /api/projects/:projectId`, and `DELETE /api/projects/:projectId`. It must assert response shapes and must not import or call generation providers.

- [ ] **Step 7: Commit**

```bash
git add server.ts README.md src/lib/localProjectStore.ts src/server/app.ts src/server/projectsRoutes.ts src/server/projectsRoutes.test.ts
git commit -m "refactor: split server bootstrap and routes"
```

## Task 6: App-Owned Project Dialogs

**Files:**
- Create: `src/components/projects/projectDialogLogic.ts`
- Create: `src/components/projects/projectDialogLogic.test.ts`
- Create: `src/components/projects/ProjectNameDialog.tsx`
- Create: `src/components/projects/ProjectNameDialog.test.tsx`
- Create: `src/components/projects/ConfirmDialog.tsx`
- Create: `src/components/projects/ConfirmDialog.test.tsx`
- Modify: `src/pages/ProjectsPage.tsx`
- Modify: `src/pages/ProjectsPage.test.tsx`
- Modify: `src/pages/ProjectCanvasPage.tsx`
- Modify: `src/pages/ProjectCanvasPage.test.tsx`

- [ ] **Step 1: Write failing dialog logic tests**

Create `src/components/projects/projectDialogLogic.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_PROJECT_DIALOG_NAME,
  createProjectDialogCallbacks,
  getProjectNameSubmissionValue,
  shouldCloseDialogForKey,
} from './projectDialogLogic';

test('empty project name submissions preserve existing default-name behavior', () => {
  assert.equal(DEFAULT_PROJECT_DIALOG_NAME, '未命名项目');
  assert.equal(getProjectNameSubmissionValue('   '), '未命名项目');
  assert.equal(getProjectNameSubmissionValue(' 海报项目 '), ' 海报项目 ');
});

test('Escape closes dialogs and other keys do not', () => {
  assert.equal(shouldCloseDialogForKey('Escape'), true);
  assert.equal(shouldCloseDialogForKey('Enter'), false);
});

test('cancel closes the active dialog without repository calls', async () => {
  const calls: string[] = [];
  const actions = createProjectDialogCallbacks({
    projectRepository: {
      createProject: async () => {
        calls.push('create');
        return { id: 'created' };
      },
      renameProject: async () => calls.push('rename'),
      deleteProject: async () => calls.push('delete'),
    },
    closeDialog: () => calls.push('close'),
    refreshProjects: async () => calls.push('refresh'),
    navigateTo: (path) => calls.push(`navigate:${path}`),
    getProjectPath: (projectId) => `/projects/${projectId}`,
  });

  actions.cancel();

  assert.deepEqual(calls, ['close']);
});

test('create submission closes, calls repository, and navigates to the created project', async () => {
  const calls: string[] = [];
  const actions = createProjectDialogCallbacks({
    projectRepository: {
      createProject: async (name) => {
        calls.push(`create:${name}`);
        return { id: 'created-project' };
      },
      renameProject: async () => calls.push('rename'),
      deleteProject: async () => calls.push('delete'),
    },
    closeDialog: () => calls.push('close'),
    refreshProjects: async () => calls.push('refresh'),
    navigateTo: (path) => calls.push(`navigate:${path}`),
    getProjectPath: (projectId) => `/projects/${projectId}`,
  });

  await actions.confirmCreate('New Project');

  assert.deepEqual(calls, ['close', 'create:New Project', 'navigate:/projects/created-project']);
});

test('rename and delete submissions close, call repository actions, and refresh projects', async () => {
  const calls: string[] = [];
  const actions = createProjectDialogCallbacks({
    projectRepository: {
      createProject: async () => ({ id: 'unused' }),
      renameProject: async (projectId, name) => calls.push(`rename:${projectId}:${name}`),
      deleteProject: async (projectId) => calls.push(`delete:${projectId}`),
    },
    closeDialog: () => calls.push('close'),
    refreshProjects: async () => calls.push('refresh'),
    navigateTo: (path) => calls.push(`navigate:${path}`),
    getProjectPath: (projectId) => `/projects/${projectId}`,
  });

  await actions.confirmRename('project-1', 'Renamed');
  await actions.confirmDelete('project-1');

  assert.deepEqual(calls, [
    'close',
    'rename:project-1:Renamed',
    'refresh',
    'close',
    'delete:project-1',
    'refresh',
  ]);
});

test('Escape callback cancels through the same close path', () => {
  const calls: string[] = [];
  const actions = createProjectDialogCallbacks({
    projectRepository: {
      createProject: async () => ({ id: 'unused' }),
      renameProject: async () => calls.push('rename'),
      deleteProject: async () => calls.push('delete'),
    },
    closeDialog: () => calls.push('close'),
    refreshProjects: async () => calls.push('refresh'),
    navigateTo: (path) => calls.push(`navigate:${path}`),
    getProjectPath: (projectId) => `/projects/${projectId}`,
  });

  actions.handleKeyDown('Enter');
  actions.handleKeyDown('Escape');

  assert.deepEqual(calls, ['close']);
});

test('dialog callback helper routes repository failures to the page error handler', async () => {
  const calls: string[] = [];
  const actions = createProjectDialogCallbacks({
    projectRepository: {
      createProject: async () => {
        throw new Error('create failed');
      },
      renameProject: async () => calls.push('rename'),
      deleteProject: async () => calls.push('delete'),
    },
    closeDialog: () => calls.push('close'),
    refreshProjects: async () => calls.push('refresh'),
    navigateTo: (path) => calls.push(`navigate:${path}`),
    getProjectPath: (projectId) => `/projects/${projectId}`,
    onError: (error) => calls.push(`error:${error instanceof Error ? error.message : String(error)}`),
  });

  await actions.confirmCreate('Broken Project');

  assert.deepEqual(calls, ['close', 'error:create failed']);
});
```

- [ ] **Step 2: Write failing static markup tests**

Create `src/components/projects/ProjectNameDialog.test.tsx`:

```tsx
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';

import { ProjectNameDialog } from './ProjectNameDialog';

test('ProjectNameDialog renders labels, form, and initial value', () => {
  const html = renderToStaticMarkup(
    <ProjectNameDialog
      title="新建项目"
      initialValue="未命名项目"
      confirmLabel="创建"
      cancelLabel="取消"
      onConfirm={() => {}}
      onCancel={() => {}}
    />
  );

  assert.match(html, /新建项目/);
  assert.match(html, /value="未命名项目"/);
  assert.match(html, /type="submit"/);
  assert.match(html, /创建/);
  assert.match(html, /取消/);
});
```

Create `src/components/projects/ConfirmDialog.test.tsx`:

```tsx
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';

import { ConfirmDialog } from './ConfirmDialog';

test('ConfirmDialog renders destructive confirmation structure', () => {
  const html = renderToStaticMarkup(
    <ConfirmDialog
      title="删除项目"
      body="删除项目“海报项目”？此操作不会进入回收站。"
      confirmLabel="删除"
      cancelLabel="取消"
      onConfirm={() => {}}
      onCancel={() => {}}
    />
  );

  assert.match(html, /删除项目/);
  assert.match(html, /海报项目/);
  assert.match(html, /删除/);
  assert.match(html, /取消/);
  assert.match(html, /AlertTriangle|aria-hidden/);
});
```

- [ ] **Step 3: Run targeted tests and verify failure**

Run:

```bash
npx tsx --test src/components/projects/projectDialogLogic.test.ts src/components/projects/ProjectNameDialog.test.tsx src/components/projects/ConfirmDialog.test.tsx
```

Expected: FAIL because the dialog modules do not exist.

- [ ] **Step 4: Implement pure dialog helpers**

Create `src/components/projects/projectDialogLogic.ts`:

```ts
export const DEFAULT_PROJECT_DIALOG_NAME = '未命名项目';

export function getProjectNameSubmissionValue(value: string) {
  return value.trim() ? value : DEFAULT_PROJECT_DIALOG_NAME;
}

export function shouldCloseDialogForKey(key: string) {
  return key === 'Escape';
}

type ProjectDialogRepository = {
  createProject: (name: string) => Promise<{ id: string }>;
  renameProject: (projectId: string, name: string) => Promise<unknown>;
  deleteProject: (projectId: string) => Promise<unknown>;
};

export function createProjectDialogCallbacks({
  projectRepository,
  closeDialog,
  refreshProjects,
  navigateTo,
  getProjectPath,
  afterDelete,
  onError,
}: {
  projectRepository: ProjectDialogRepository;
  closeDialog: () => void;
  refreshProjects: () => Promise<void>;
  navigateTo: (path: string) => void;
  getProjectPath: (projectId: string) => string;
  afterDelete?: (projectId: string) => void | Promise<void>;
  onError?: (error: unknown) => void | Promise<void>;
}) {
  const cancel = () => closeDialog();

  async function runDialogAction(action: () => Promise<void>) {
    try {
      await action();
    } catch (error) {
      await onError?.(error);
    }
  }

  return {
    cancel,
    handleKeyDown(key: string) {
      if (shouldCloseDialogForKey(key)) cancel();
    },
    async confirmCreate(name: string) {
      await runDialogAction(async () => {
        closeDialog();
        const project = await projectRepository.createProject(name);
        navigateTo(getProjectPath(project.id));
      });
    },
    async confirmRename(projectId: string, name: string) {
      await runDialogAction(async () => {
        closeDialog();
        await projectRepository.renameProject(projectId, name);
        await refreshProjects();
      });
    },
    async confirmDelete(projectId: string) {
      await runDialogAction(async () => {
        closeDialog();
        await projectRepository.deleteProject(projectId);
        await afterDelete?.(projectId);
        await refreshProjects();
      });
    },
  };
}
```

- [ ] **Step 5: Implement dialog components**

Create `src/components/projects/ProjectNameDialog.tsx`:

```tsx
import { FormEvent, useEffect, useState } from 'react';
import { FolderPlus, X } from 'lucide-react';
import {
  getProjectNameSubmissionValue,
  shouldCloseDialogForKey,
} from './projectDialogLogic';

export type ProjectNameDialogProps = {
  title: string;
  initialValue: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: (name: string) => void;
  onCancel: () => void;
};

export function ProjectNameDialog({
  title,
  initialValue,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: ProjectNameDialogProps) {
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (shouldCloseDialogForKey(event.key)) onCancel();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    onConfirm(getProjectNameSubmissionValue(value));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-lg border p-5 shadow-2xl"
        style={{ background: '#1D1A14', borderColor: 'rgba(242,193,78,0.24)', color: '#EEE4CE' }}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-base font-semibold">
            <FolderPlus size={18} style={{ color: '#F2C14E' }} />
            {title}
          </div>
          <button type="button" onClick={onCancel} className="rounded-lg p-1" style={{ color: '#96836F' }} aria-label={cancelLabel}>
            <X size={18} />
          </button>
        </div>
        <input
          autoFocus
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="mt-4 w-full rounded-lg border px-3 py-2 text-sm outline-none"
          style={{ background: '#141210', borderColor: 'rgba(242,193,78,0.2)', color: '#EEE4CE' }}
        />
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-lg px-3 py-2 text-sm" style={{ color: '#96836F' }}>
            {cancelLabel}
          </button>
          <button type="submit" className="rounded-lg px-3 py-2 text-sm font-medium" style={{ background: '#F2C14E', color: '#16130F' }}>
            {confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
```

Create `src/components/projects/ConfirmDialog.tsx`:

```tsx
import { useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { shouldCloseDialogForKey } from './projectDialogLogic';

export type ConfirmDialogProps = {
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (shouldCloseDialogForKey(event.key)) onCancel();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <section
        className="w-full max-w-sm rounded-lg border p-5 shadow-2xl"
        style={{ background: '#1D1A14', borderColor: 'rgba(217,123,58,0.34)', color: '#EEE4CE' }}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-base font-semibold">
            <AlertTriangle size={18} style={{ color: '#D97B3A' }} />
            {title}
          </div>
          <button type="button" onClick={onCancel} className="rounded-lg p-1" style={{ color: '#96836F' }} aria-label={cancelLabel}>
            <X size={18} />
          </button>
        </div>
        <p className="mt-3 text-sm leading-6" style={{ color: '#BCA88E' }}>{body}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-lg px-3 py-2 text-sm" style={{ color: '#96836F' }}>
            {cancelLabel}
          </button>
          <button type="button" onClick={onConfirm} className="rounded-lg px-3 py-2 text-sm font-medium" style={{ background: '#D97B3A', color: '#16130F' }}>
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 6: Write failing page-wiring tests**

Update `ProjectsPage.test.tsx` before changing `ProjectsPage.tsx`.

Add these imports if they are not already present:

```tsx
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { ProjectNameDialog } from '../components/projects/ProjectNameDialog';
import { ConfirmDialog } from '../components/projects/ConfirmDialog';
```

Add this helper near the existing test setup:

```tsx
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
```

Add these tests:

```tsx
test('project dialogs render without native browser prompt text', () => {
  const createHtml = renderToStaticMarkup(
    <ProjectNameDialog
      title="新建项目"
      initialValue="未命名项目"
      confirmLabel="创建"
      cancelLabel="取消"
      onConfirm={() => {}}
      onCancel={() => {}}
    />
  );
  const deleteHtml = renderToStaticMarkup(
    <ConfirmDialog
      title="删除项目"
      body="删除项目“海报项目”？此操作不会进入回收站。"
      confirmLabel="删除"
      cancelLabel="取消"
      onConfirm={() => {}}
      onCancel={() => {}}
    />
  );

  assert.match(createHtml, /新建项目/);
  assert.match(deleteHtml, /删除项目/);
});

test('ProjectsPage dialog callbacks are wired through the tested helper', () => {
  const source = readFileSync(path.join(rootDir, 'src/pages/ProjectsPage.tsx'), 'utf8');

  assert.match(source, /createProjectDialogCallbacks/);
  assert.doesNotMatch(source, /window\.prompt|window\.confirm/);
  assert.doesNotMatch(source, /const confirmCreate = async/);
  assert.doesNotMatch(source, /const confirmRename = async/);
  assert.doesNotMatch(source, /const confirmDelete = async/);
});
```

Update `ProjectCanvasPage.test.tsx` before changing `ProjectCanvasPage.tsx`.

Add this import if it is not already present:

```tsx
import { ProjectNameDialog } from '../components/projects/ProjectNameDialog';
```

Add this test:

```tsx
test('project canvas rename dialog renders with project name input', () => {
  const html = renderToStaticMarkup(
    <ProjectNameDialog
      title="重命名项目"
      initialValue="海报项目"
      confirmLabel="保存"
      cancelLabel="取消"
      onConfirm={() => {}}
      onCancel={() => {}}
    />
  );

  assert.match(html, /重命名项目/);
  assert.match(html, /value="海报项目"/);
  assert.match(html, /保存/);
});
```

Run:

```bash
npx tsx --test src/pages/ProjectsPage.test.tsx src/pages/ProjectCanvasPage.test.tsx
```

Expected: FAIL while production pages still use native `window.prompt` and `window.confirm`. The `ProjectsPage` wiring assertion should fail until `ProjectsPage.tsx` imports and uses `createProjectDialogCallbacks` and removes native dialogs.

- [ ] **Step 7: Replace native dialogs in pages**

In `ProjectsPage.tsx`, track dialog state:

```ts
type ProjectDialogState =
  | { type: 'create' }
  | { type: 'rename'; project: ProjectMeta }
  | { type: 'delete'; project: ProjectMeta }
  | null;

const [dialog, setDialog] = useState<ProjectDialogState>(null);
```

Change handlers so they open dialogs:

```ts
const handleCreate = () => setDialog({ type: 'create' });

const handleRename = (projectId: string) => {
  const project = projects.find((item) => item.id === projectId);
  if (project) setDialog({ type: 'rename', project });
};

const handleDelete = (projectId: string) => {
  const project = projects.find((item) => item.id === projectId);
  if (project) setDialog({ type: 'delete', project });
};
```

Create the page callback adapter from the same tested helper. `ProjectsPage.tsx` must not duplicate the create, rename, or delete callback bodies inline:

```ts
const dialogCallbacks = createProjectDialogCallbacks({
  projectRepository,
  closeDialog: () => setDialog(null),
  refreshProjects,
  navigateTo,
  getProjectPath,
  afterDelete: (projectId) => {
    setProjects(sortProjectsByUpdatedAt(projects.filter((item) => item.id !== projectId)));
  },
  onError: (error) => {
    setErrorMessage(getErrorMessage(error));
    setStatus('error');
  },
});
```

Render dialogs as siblings after the existing `ProjectsPageView` call in `ProjectsPage.tsx`:

- Add imports for `ProjectNameDialog`, `ConfirmDialog`, and `createProjectDialogCallbacks`.
- Preserve the existing `ProjectsPageView` import and its current prop list.
- Wrap the current single-element `ProjectsPageView` return expression in a fragment.
- Keep the existing `ProjectsPageView` JSX unchanged inside that fragment.
- Append the three conditional dialog renders below it.
- Replace the existing native dialog handlers with the `setDialog` handlers shown above.
- Do not keep inline `confirmCreate`, `confirmRename`, or `confirmDelete` functions in the page; route those actions through `dialogCallbacks`.

Append this JSX immediately after the preserved `ProjectsPageView` element:

```tsx
{dialog?.type === 'create' && (
  <ProjectNameDialog
    title="新建项目"
    initialValue="未命名项目"
    confirmLabel="创建"
    cancelLabel="取消"
    onConfirm={dialogCallbacks.confirmCreate}
    onCancel={() => setDialog(null)}
  />
)}
{dialog?.type === 'rename' && (
  <ProjectNameDialog
    title="重命名项目"
    initialValue={dialog.project.name}
    confirmLabel="保存"
    cancelLabel="取消"
    onConfirm={(name) => dialogCallbacks.confirmRename(dialog.project.id, name)}
    onCancel={() => setDialog(null)}
  />
)}
{dialog?.type === 'delete' && (
  <ConfirmDialog
    title="删除项目"
    body={`删除项目“${dialog.project.name}”？此操作不会进入回收站。`}
    confirmLabel="删除"
    cancelLabel="取消"
    onConfirm={() => dialogCallbacks.confirmDelete(dialog.project.id)}
    onCancel={() => setDialog(null)}
  />
)}
```

In `ProjectCanvasPage.tsx`, use `ProjectNameDialog` for rename with the same confirm/cancel labels and initial value of `project.name`.

- [ ] **Step 8: Run targeted and relevant tests**

Run:

```bash
npx tsx --test src/components/projects/projectDialogLogic.test.ts src/components/projects/ProjectNameDialog.test.tsx src/components/projects/ConfirmDialog.test.tsx src/pages/ProjectsPage.test.tsx src/pages/ProjectCanvasPage.test.tsx
npm run lint
```

Expected: PASS. Also run:

```bash
rg "window\\.prompt|window\\.confirm" src
```

Expected: no matches.

- [ ] **Step 9: Commit**

```bash
git add src/components/projects/projectDialogLogic.ts src/components/projects/projectDialogLogic.test.ts src/components/projects/ProjectNameDialog.tsx src/components/projects/ProjectNameDialog.test.tsx src/components/projects/ConfirmDialog.tsx src/components/projects/ConfirmDialog.test.tsx src/pages/ProjectsPage.tsx src/pages/ProjectsPage.test.tsx src/pages/ProjectCanvasPage.tsx src/pages/ProjectCanvasPage.test.tsx
git commit -m "feat: replace project native dialogs"
```

## Task 7: Reference Image And Shared Mask Workflow Hooks

**Files:**
- Create: `src/components/nodes/useReferenceImages.ts`
- Create: `src/components/nodes/useReferenceImages.test.ts`
- Create: `src/components/nodes/useMaskGeneration.ts`
- Create: `src/components/nodes/useMaskGeneration.test.ts`
- Modify: `src/components/nodes/PromptNode.tsx`
- Modify: `src/components/nodes/ImageNode.tsx`
- Modify: `src/components/nodes/ImageNode.test.tsx`

- [ ] **Step 1: Write failing reference image tests**

Create `src/components/nodes/useReferenceImages.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildAddReferenceImagePatch,
  buildRemoveReferenceImagePatch,
  canAddReferenceImage,
  createReferenceImageController,
  extractPasteImageFiles,
  parseImageDataUrl,
  selectImageFiles,
} from './useReferenceImages';

const image = { data: 'base64', mimeType: 'image/png', url: 'data:image/png;base64,base64' };

test('canAddReferenceImage enforces hydration and four-image limit', () => {
  assert.equal(canAddReferenceImage({ hasPendingReferenceHydration: true, referenceCount: 0 }), false);
  assert.equal(canAddReferenceImage({ hasPendingReferenceHydration: false, referenceCount: 4 }), false);
  assert.equal(canAddReferenceImage({ hasPendingReferenceHydration: false, referenceCount: 3 }), true);
});

test('selectImageFiles keeps only image files and respects remaining slots', () => {
  const png = { type: 'image/png', name: 'a.png' } as File;
  const jpg = { type: 'image/jpeg', name: 'b.jpg' } as File;
  const text = { type: 'text/plain', name: 'notes.txt' } as File;

  assert.deepEqual(selectImageFiles([png, text, jpg], { currentCount: 3, maxCount: 4 }), [png]);
  assert.deepEqual(selectImageFiles([png, jpg], { currentCount: 4, maxCount: 4 }), []);
});

test('extractPasteImageFiles reads image files from clipboard items without DOM dependencies', () => {
  const png = { type: 'image/png', name: 'paste.png' } as File;
  const files = extractPasteImageFiles({
    items: [
      { kind: 'string', type: 'text/plain', getAsFile: () => null },
      { kind: 'file', type: 'image/png', getAsFile: () => png },
    ],
  });

  assert.deepEqual(files, [png]);
});

test('parseImageDataUrl returns inline image data without FileReader', () => {
  assert.deepEqual(
    parseImageDataUrl('data:image/png;base64,abc123'),
    { mimeType: 'image/png', data: 'abc123', url: 'data:image/png;base64,abc123' }
  );
  assert.throws(() => parseImageDataUrl('not-a-data-url'), /Invalid image format/);
});

test('reference image controller upload and paste read through injected reader and patch node data', async () => {
  const patches: Array<{ nodeId: string; patch: unknown }> = [];
  const png = { type: 'image/png', name: 'upload.png' } as File;
  const paste = { type: 'image/jpeg', name: 'paste.jpg' } as File;
  const controller = createReferenceImageController({
    nodeId: 'prompt-1',
    data: { referenceImages: [] } as any,
    assets: {},
    assetsHydrated: true,
    updateNodeData: (nodeId, patch) => patches.push({ nodeId, patch }),
    readImageFile: async (file) => ({
      data: file.name,
      mimeType: file.type,
      url: `data:${file.type};base64,${file.name}`,
    }),
  });

  const uploadEvent = { target: { files: [png], value: 'selected' } };
  await controller.handleImageUpload(uploadEvent);

  let prevented = false;
  await controller.handlePaste({
    clipboardData: { items: [{ kind: 'file', type: 'image/jpeg', getAsFile: () => paste }] },
    preventDefault: () => {
      prevented = true;
    },
  });

  assert.equal(uploadEvent.target.value, '');
  assert.equal(prevented, true);
  assert.deepEqual(patches, [
    {
      nodeId: 'prompt-1',
      patch: {
        referenceImages: [{ data: 'upload.png', mimeType: 'image/png', url: 'data:image/png;base64,upload.png' }],
        referenceImageIds: undefined,
        referenceImage: undefined,
      },
    },
    {
      nodeId: 'prompt-1',
      patch: {
        referenceImages: [{ data: 'paste.jpg', mimeType: 'image/jpeg', url: 'data:image/jpeg;base64,paste.jpg' }],
        referenceImageIds: undefined,
        referenceImage: undefined,
      },
    },
  ]);
});

test('reference image controller reports injected read failures and clears upload input', async () => {
  const patches: Array<{ nodeId: string; patch: unknown }> = [];
  const png = { type: 'image/png', name: 'broken.png' } as File;
  const controller = createReferenceImageController({
    nodeId: 'prompt-1',
    data: { referenceImages: [] } as any,
    assets: {},
    assetsHydrated: true,
    updateNodeData: (nodeId, patch) => patches.push({ nodeId, patch }),
    readImageFile: async () => {
      throw new Error('read failed');
    },
  });

  const uploadEvent = { target: { files: [png], value: 'selected' } };
  await controller.handleImageUpload(uploadEvent);

  assert.equal(uploadEvent.target.value, '');
  assert.deepEqual(patches, [{ nodeId: 'prompt-1', patch: { error: 'read failed' } }]);
});

test('asset-backed reference add preserves referenceImageIds precedence and stores new inline image', () => {
  assert.deepEqual(
    buildAddReferenceImagePatch({
      usesReferenceImageIds: true,
      referenceImageIds: ['asset-1'],
      referenceImages: [],
      nextImage: image,
    }),
    {
      referenceImageIds: ['asset-1'],
      referenceImages: [image],
      referenceImage: undefined,
    }
  );
});

test('inline reference add appends and caps at four', () => {
  const existing = [image, image, image, image];
  assert.deepEqual(
    buildAddReferenceImagePatch({
      usesReferenceImageIds: false,
      referenceImageIds: [],
      referenceImages: existing,
      nextImage: image,
    }),
    {
      referenceImages: existing,
      referenceImageIds: undefined,
      referenceImage: undefined,
    }
  );
});

test('remove reference image handles asset-backed and inline references', () => {
  assert.deepEqual(
    buildRemoveReferenceImagePatch({
      usesReferenceImageIds: true,
      referenceImageIds: ['a', 'b'],
      referenceImages: [],
      index: 0,
    }),
    {
      referenceImageIds: ['b'],
      referenceImages: undefined,
      referenceImage: undefined,
    }
  );

  assert.deepEqual(
    buildRemoveReferenceImagePatch({
      usesReferenceImageIds: false,
      referenceImageIds: [],
      referenceImages: [image, { ...image, data: 'second' }],
      index: 1,
    }),
    {
      referenceImages: [image],
      referenceImageIds: undefined,
      referenceImage: undefined,
    }
  );
});

test('add and remove patches are blocked by pending hydration through canAddReferenceImage', () => {
  assert.equal(canAddReferenceImage({ hasPendingReferenceHydration: true, referenceCount: 1 }), false);
});
```

- [ ] **Step 2: Write failing shared mask tests**

Create `src/components/nodes/useMaskGeneration.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildImageMaskGenerationPayload,
  buildPromptMaskGenerationPayload,
} from './useMaskGeneration';

const sourceImage = { data: 'source', mimeType: 'image/png', url: 'data:image/png;base64,source' };
const extraImage = { data: 'extra', mimeType: 'image/png', url: 'data:image/png;base64,extra' };
const maskImage = { data: 'mask', mimeType: 'image/png' };

test('prompt mask generation places source image first and excludes edited reference duplicate', () => {
  assert.deepEqual(
    buildPromptMaskGenerationPayload({
      maskPrompt: '改帽子',
      maskImage,
      sourceImage,
      sourceIndex: 0,
      referenceImages: [sourceImage, extraImage],
      aspectRatio: '1:1',
      imageSize: '1K',
      image2Options: { quality: 'high' },
    }),
    {
      prompt: '改帽子',
      imageModel: 'image2',
      aspectRatio: '1:1',
      imageSize: '1K',
      image2Options: { quality: 'high' },
      referenceImages: [
        { data: 'source', mimeType: 'image/png' },
        { data: 'extra', mimeType: 'image/png' },
      ],
      maskImage,
    }
  );
});

test('image mask generation uses only the edited image as reference', () => {
  assert.deepEqual(
    buildImageMaskGenerationPayload({
      maskPrompt: '改帽子',
      maskImage,
      sourceImage,
      aspectRatio: '16:9',
      imageSize: '2K',
      image2Options: { responseFormat: 'url' },
    }),
    {
      prompt: '改帽子',
      imageModel: 'image2',
      aspectRatio: '16:9',
      imageSize: '2K',
      image2Options: { responseFormat: 'url' },
      referenceImages: [{ data: 'source', mimeType: 'image/png' }],
      maskImage,
    }
  );
});
```

- [ ] **Step 3: Run targeted tests and verify failure**

Run:

```bash
npx tsx --test src/components/nodes/useReferenceImages.test.ts src/components/nodes/useMaskGeneration.test.ts
```

Expected: FAIL because the hook modules do not exist.

- [ ] **Step 4: Implement reference image helper functions and hook**

Create `src/components/nodes/useReferenceImages.ts` with pure helpers plus the hook. Keep `FileReader` isolated in `createBrowserImageFileReader`; upload and paste core logic must use the injected `readImageFile` function so `node:test` can cover reads without DOM globals:

```ts
import { useRef, useState } from 'react';
import { resolveReferenceImages, type InlineImageData } from '../../lib/canvasState';
import type { AppNode } from '../../store';

export type ReferenceImagePatch = Pick<AppNode['data'], 'referenceImage' | 'referenceImages' | 'referenceImageIds'>;

export type ReadImageFile = (file: File) => Promise<InlineImageData>;

export function parseImageDataUrl(dataUrl: string): InlineImageData {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) throw new Error('Invalid image format');
  return { mimeType: match[1], data: match[2], url: dataUrl };
}

export function createBrowserImageFileReader({
  createFileReader = () => new FileReader(),
}: {
  createFileReader?: () => FileReader;
} = {}): ReadImageFile {
  return (file) => new Promise((resolve, reject) => {
    const reader = createFileReader();
    reader.onload = (event) => {
      const base64String = event.target?.result as string;
      try {
        resolve(parseImageDataUrl(base64String));
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = () => reject(new Error('读取图片失败'));
    reader.readAsDataURL(file);
  });
}

export const readImageFile = createBrowserImageFileReader();

export function canAddReferenceImage({
  hasPendingReferenceHydration,
  referenceCount,
}: {
  hasPendingReferenceHydration: boolean;
  referenceCount: number;
}) {
  return !hasPendingReferenceHydration && referenceCount < 4;
}

export function selectImageFiles(
  files: Iterable<File>,
  { currentCount, maxCount = 4 }: { currentCount: number; maxCount?: number }
) {
  const remainingSlots = Math.max(0, maxCount - currentCount);
  return Array.from(files)
    .filter((file) => file.type.startsWith('image/'))
    .slice(0, remainingSlots);
}

export function extractPasteImageFiles(clipboardData: {
  items?: Iterable<{ kind: string; type: string; getAsFile: () => File | null }>;
}) {
  return Array.from(clipboardData.items ?? [])
    .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file));
}

export function buildAddReferenceImagePatch({
  usesReferenceImageIds,
  referenceImageIds,
  referenceImages,
  nextImage,
}: {
  usesReferenceImageIds: boolean;
  referenceImageIds: string[];
  referenceImages: InlineImageData[];
  nextImage: InlineImageData;
}): ReferenceImagePatch {
  if (usesReferenceImageIds) {
    return {
      referenceImageIds,
      referenceImages: [nextImage],
      referenceImage: undefined,
    };
  }

  return {
    referenceImages: [...referenceImages, nextImage].slice(0, 4),
    referenceImageIds: undefined,
    referenceImage: undefined,
  };
}

export function buildRemoveReferenceImagePatch({
  usesReferenceImageIds,
  referenceImageIds,
  referenceImages,
  index,
}: {
  usesReferenceImageIds: boolean;
  referenceImageIds: string[];
  referenceImages: InlineImageData[];
  index: number;
}): ReferenceImagePatch {
  if (usesReferenceImageIds) {
    return {
      referenceImageIds: referenceImageIds.filter((_, currentIndex) => currentIndex !== index),
      referenceImages: undefined,
      referenceImage: undefined,
    };
  }

  return {
    referenceImages: referenceImages.filter((_, currentIndex) => currentIndex !== index),
    referenceImageIds: undefined,
    referenceImage: undefined,
  };
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : '读取图片失败';
}

export function createReferenceImageController({
  nodeId,
  data,
  assets,
  assetsHydrated,
  updateNodeData,
  readImageFile,
}: {
  nodeId: string;
  data: AppNode['data'];
  assets: Parameters<typeof resolveReferenceImages>[1];
  assetsHydrated: boolean;
  updateNodeData: (nodeId: string, patch: Partial<AppNode['data']>) => void;
  readImageFile: ReadImageFile;
}) {
  const referenceImages = resolveReferenceImages(data, assets);
  const rawReferenceImageIds = data.referenceImageIds ?? [];
  const referenceImageIds = assetsHydrated
    ? rawReferenceImageIds.filter((referenceImageId) => assets[referenceImageId])
    : rawReferenceImageIds;
  const usesReferenceImageIds = data.referenceImageIds != null;
  const hasPendingReferenceHydration = !assetsHydrated && rawReferenceImageIds.length > 0;

  const appendReferenceImage = (nextImage: InlineImageData) => {
    if (!canAddReferenceImage({ hasPendingReferenceHydration, referenceCount: referenceImages.length })) return;
    updateNodeData(nodeId, buildAddReferenceImagePatch({
      usesReferenceImageIds,
      referenceImageIds,
      referenceImages,
      nextImage,
    }));
  };

  const removeReferenceImage = (index: number) => {
    if (hasPendingReferenceHydration) return;
    updateNodeData(nodeId, buildRemoveReferenceImagePatch({
      usesReferenceImageIds,
      referenceImageIds,
      referenceImages,
      index,
    }));
  };

  const readAndAppendFiles = async (files: File[]) => {
    const selectedFiles = selectImageFiles(files, { currentCount: referenceImages.length });
    for (const file of selectedFiles) {
      try {
        appendReferenceImage(await readImageFile(file));
      } catch (error) {
        updateNodeData(nodeId, { error: getErrorMessage(error) });
      }
    }
  };

  const handleImageUpload = async (event: { target: { files: FileList | File[] | null; value: string } }) => {
    await readAndAppendFiles(Array.from(event.target.files ?? []));
    event.target.value = '';
  };

  const handlePaste = async (event: { clipboardData: Parameters<typeof extractPasteImageFiles>[0]; preventDefault: () => void }) => {
    const files = extractPasteImageFiles(event.clipboardData);
    if (!files.length) return;
    event.preventDefault();
    await readAndAppendFiles(files);
  };

  return {
    referenceImages,
    referenceImageIds,
    usesReferenceImageIds,
    hasPendingReferenceHydration,
    appendReferenceImage,
    removeReferenceImage,
    handleImageUpload,
    handlePaste,
  };
}

export function useReferenceImages({
  nodeId,
  data,
  assets,
  assetsHydrated,
  updateNodeData,
  readImageFile = createBrowserImageFileReader(),
}: {
  nodeId: string;
  data: AppNode['data'];
  assets: Parameters<typeof resolveReferenceImages>[1];
  assetsHydrated: boolean;
  updateNodeData: (nodeId: string, patch: Partial<AppNode['data']>) => void;
  readImageFile?: ReadImageFile;
}) {
  const [isReadingFile, setIsReadingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const controller = createReferenceImageController({
    nodeId,
    data,
    assets,
    assetsHydrated,
    updateNodeData,
    readImageFile,
  });

  const withReadingState = async (action: () => Promise<void>) => {
    setIsReadingFile(true);
    try {
      await action();
    } finally {
      setIsReadingFile(false);
    }
  };

  return {
    fileInputRef,
    isReadingFile,
    setIsReadingFile,
    ...controller,
    handleImageUpload: (event: Parameters<typeof controller.handleImageUpload>[0]) => withReadingState(() => controller.handleImageUpload(event)),
    handlePaste: (event: Parameters<typeof controller.handlePaste>[0]) => withReadingState(() => controller.handlePaste(event)),
  };
}
```

- [ ] **Step 5: Implement shared mask generation helpers and hook**

Create `src/components/nodes/useMaskGeneration.ts`:

```ts
import { generateImage } from '../../services/gemini';
import type { InlineImageData } from '../../lib/canvasState';
import type { Image2Options } from '../../lib/imageModels';
import type { MaskGeneratePayload } from '../mask/MaskEditorModal';

type MaskImage = MaskGeneratePayload['maskImage'];

function toReferencePayload(image: InlineImageData) {
  return { data: image.data, mimeType: image.mimeType };
}

export function buildPromptMaskGenerationPayload({
  maskPrompt,
  maskImage,
  sourceImage,
  sourceIndex,
  referenceImages,
  aspectRatio,
  imageSize,
  image2Options,
}: {
  maskPrompt: string;
  maskImage: MaskImage;
  sourceImage: InlineImageData;
  sourceIndex: number;
  referenceImages: InlineImageData[];
  aspectRatio: string;
  imageSize: string;
  image2Options: Image2Options | undefined;
}) {
  const editReferences = [
    sourceImage,
    ...referenceImages.filter((_, index) => index !== sourceIndex),
  ].slice(0, 4);

  return {
    prompt: maskPrompt,
    imageModel: 'image2' as const,
    aspectRatio,
    imageSize,
    image2Options,
    referenceImages: editReferences.map(toReferencePayload),
    maskImage,
  };
}

export function buildImageMaskGenerationPayload({
  maskPrompt,
  maskImage,
  sourceImage,
  aspectRatio,
  imageSize,
  image2Options,
}: {
  maskPrompt: string;
  maskImage: MaskImage;
  sourceImage: InlineImageData;
  aspectRatio: string;
  imageSize: string;
  image2Options: Image2Options | undefined;
}) {
  return {
    prompt: maskPrompt,
    imageModel: 'image2' as const,
    aspectRatio,
    imageSize,
    image2Options,
    referenceImages: [toReferencePayload(sourceImage)],
    maskImage,
  };
}

export function useMaskGeneration() {
  return {
    generateMaskImage: generateImage,
  };
}
```

Refactor `PromptNode.tsx` and `ImageNode.tsx` to call `buildPromptMaskGenerationPayload` and `buildImageMaskGenerationPayload` before `generateImage`. Keep node creation, edge creation, error update, and modal closing behavior identical.

- [ ] **Step 6: Refactor PromptNode reference image code through the hook**

In `PromptNode.tsx`, delete the local `readImageFile`, reference ID filtering, upload/paste file selection, `appendReferenceImage`, and `removeReferenceImage` definitions. Import:

```ts
import { useReferenceImages } from './useReferenceImages';
```

Use:

```ts
const {
  fileInputRef,
  isReadingFile,
  setIsReadingFile,
  referenceImages,
  referenceImageIds,
  hasPendingReferenceHydration,
  appendReferenceImage,
  removeReferenceImage,
  handleImageUpload,
  handlePaste,
} = useReferenceImages({
  nodeId: id,
  data,
  assets,
  assetsHydrated,
  updateNodeData,
});
```

Wire the returned `handleImageUpload` and `handlePaste` to the existing file input and paste target. Keep rendered controls with the same labels and disabled states.

- [ ] **Step 7: Run targeted and relevant tests**

Run:

```bash
npx tsx --test src/components/nodes/useReferenceImages.test.ts src/components/nodes/useMaskGeneration.test.ts src/components/nodes/ImageNode.test.tsx src/components/nodes/GeneratingImagePlaceholder.test.tsx
npm run lint
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/components/nodes/useReferenceImages.ts src/components/nodes/useReferenceImages.test.ts src/components/nodes/useMaskGeneration.ts src/components/nodes/useMaskGeneration.test.ts src/components/nodes/PromptNode.tsx src/components/nodes/ImageNode.tsx src/components/nodes/ImageNode.test.tsx
git commit -m "refactor: extract reference and mask node workflows"
```

## Task 8: Prompt Generation And Image Node Action Hooks, Then Final Check

**Files:**
- Create: `src/components/nodes/usePromptGeneration.ts`
- Create: `src/components/nodes/usePromptGeneration.test.ts`
- Create: `src/components/nodes/useImageNodeActions.ts`
- Create: `src/components/nodes/useImageNodeActions.test.ts`
- Modify: `src/components/nodes/PromptNode.tsx`
- Modify: `src/components/nodes/ImageNode.tsx`
- Modify: `src/components/nodes/ImageNode.test.tsx`
- Modify: `README.md`

- [ ] **Step 1: Write failing prompt generation logic tests**

Create `src/components/nodes/usePromptGeneration.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildGenerationReferenceData,
  buildImagePlaceholderData,
  buildPromptGenerationEdges,
  createPromptGenerationRunner,
} from './usePromptGeneration';

const referenceImage = { data: 'base64', mimeType: 'image/png', url: 'data:image/png;base64,base64' };

test('buildGenerationReferenceData prefers asset IDs over inline references', () => {
  assert.deepEqual(
    buildGenerationReferenceData({
      referenceImageIds: ['asset-1'],
      referenceImages: [referenceImage],
    }),
    { referenceImageIds: ['asset-1'] }
  );

  assert.deepEqual(
    buildGenerationReferenceData({
      referenceImageIds: [],
      referenceImages: [referenceImage],
    }),
    { referenceImages: [referenceImage] }
  );
});

test('buildImagePlaceholderData keeps model-specific options on generated placeholders', () => {
  assert.deepEqual(
    buildImagePlaceholderData({
      prompt: 'draw',
      imageModel: 'banana',
      imageModelLabel: 'Banana',
      aspectRatio: '1:1',
      imageSize: '1K',
      bananaOptions: { thinkingLevel: 'HIGH' },
      image2Options: { quality: 'high' },
      createdAt: '2026-04-27T00:00:00.000Z',
      referenceData: {},
    }),
    {
      prompt: 'draw',
      imageModel: 'banana',
      aspectRatio: '1:1',
      imageSize: '1K',
      bananaOptions: { thinkingLevel: 'HIGH' },
      image2Options: undefined,
      isLoading: true,
      error: undefined,
      createdAt: '2026-04-27T00:00:00.000Z',
      generationTitle: 'Banana | draw',
    }
  );
});

test('buildPromptGenerationEdges creates one edge per generated image node', () => {
  assert.deepEqual(
    buildPromptGenerationEdges('prompt-1', ['image-1', 'image-2']),
    [
      { id: 'e-prompt-1-image-1', source: 'prompt-1', target: 'image-1' },
      { id: 'e-prompt-1-image-2', source: 'prompt-1', target: 'image-2' },
    ]
  );
});

test('prompt generation runner ignores empty prompt without side effects', async () => {
  const calls: string[] = [];
  const runner = createPromptGenerationRunner({
    generateImage: async () => {
      calls.push('generate');
      return 'data:image/png;base64,result';
    },
    addNode: () => {
      calls.push('add');
      return 'image-1';
    },
    deleteNode: (nodeId) => calls.push(`delete:${nodeId}`),
    updateNodeData: (nodeId, patch) => calls.push(`update:${nodeId}:${JSON.stringify(patch)}`),
    setEdges: (edges) => calls.push(`edges:${edges.length}`),
    commitPrompt: () => calls.push('commit'),
    now: () => '2026-04-27T00:00:00.000Z',
  });

  await runner.run({
    nodeId: 'prompt-1',
    prompt: '   ',
    imageModel: 'banana',
    imageModelLabel: 'Banana',
    aspectRatio: '1:1',
    imageSize: '1K',
    batchCount: 1,
    referenceImageIds: [],
    referenceImages: [],
    hasPendingReferenceHydration: false,
    nodePosition: { x: 0, y: 0 },
  });

  assert.deepEqual(calls, []);
});

test('prompt generation runner blocks concurrent runs', async () => {
  const calls: string[] = [];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const runner = createPromptGenerationRunner({
    generateImage: async () => {
      calls.push('generate');
      await gate;
      return 'data:image/png;base64,result';
    },
    addNode: () => {
      calls.push('add');
      return 'image-1';
    },
    deleteNode: (nodeId) => calls.push(`delete:${nodeId}`),
    updateNodeData: (nodeId, patch) => calls.push(`update:${nodeId}:${JSON.stringify(patch)}`),
    setEdges: (edges) => calls.push(`edges:${edges.length}`),
    commitPrompt: () => calls.push('commit'),
    now: () => '2026-04-27T00:00:00.000Z',
  });

  const first = runner.run({
    nodeId: 'prompt-1',
    prompt: 'draw',
    imageModel: 'banana',
    imageModelLabel: 'Banana',
    aspectRatio: '1:1',
    imageSize: '1K',
    batchCount: 1,
    referenceImageIds: [],
    referenceImages: [],
    hasPendingReferenceHydration: false,
    nodePosition: { x: 0, y: 0 },
  });
  await runner.run({
    nodeId: 'prompt-1',
    prompt: 'draw again',
    imageModel: 'banana',
    imageModelLabel: 'Banana',
    aspectRatio: '1:1',
    imageSize: '1K',
    batchCount: 1,
    referenceImageIds: [],
    referenceImages: [],
    hasPendingReferenceHydration: false,
    nodePosition: { x: 0, y: 0 },
  });
  release();
  await first;

  assert.equal(calls.filter((call) => call === 'generate').length, 1);
});

test('prompt generation runner blocks pending reference hydration', async () => {
  const calls: string[] = [];
  const runner = createPromptGenerationRunner({
    generateImage: async () => 'data:image/png;base64,result',
    addNode: () => 'image-1',
    deleteNode: (nodeId) => calls.push(`delete:${nodeId}`),
    updateNodeData: (nodeId, patch) => calls.push(`update:${nodeId}:${JSON.stringify(patch)}`),
    setEdges: (edges) => calls.push(`edges:${edges.length}`),
    commitPrompt: () => calls.push('commit'),
    now: () => '2026-04-27T00:00:00.000Z',
  });

  await runner.run({
    nodeId: 'prompt-1',
    prompt: 'draw',
    imageModel: 'banana',
    imageModelLabel: 'Banana',
    aspectRatio: '1:1',
    imageSize: '1K',
    batchCount: 1,
    referenceImageIds: ['asset-1'],
    referenceImages: [],
    hasPendingReferenceHydration: true,
    nodePosition: { x: 0, y: 0 },
  });

  assert.deepEqual(calls, ['update:prompt-1:{"error":"参考图仍在加载中，请稍候"}']);
});

test('prompt generation runner creates batch placeholders, edges, and final images', async () => {
  const calls: string[] = [];
  const runner = createPromptGenerationRunner({
    generateImage: async ({ prompt }) => `data:image/png;base64,${prompt}`,
    addNode: (_type, position, data) => {
      const id = `image-${calls.filter((call) => call.startsWith('add:')).length + 1}`;
      calls.push(`add:${id}:${position.x},${position.y}:${data.generationTitle}`);
      return id;
    },
    deleteNode: (nodeId) => calls.push(`delete:${nodeId}`),
    updateNodeData: (nodeId, patch) => calls.push(`update:${nodeId}:${JSON.stringify(patch)}`),
    setEdges: (edges) => calls.push(`edges:${edges.map((edge) => edge.target).join(',')}`),
    commitPrompt: () => calls.push('commit'),
    now: () => '2026-04-27T00:00:00.000Z',
  });

  await runner.run({
    nodeId: 'prompt-1',
    prompt: 'draw',
    imageModel: 'banana',
    imageModelLabel: 'Banana',
    aspectRatio: '1:1',
    imageSize: '1K',
    batchCount: 2,
    referenceImageIds: [],
    referenceImages: [],
    hasPendingReferenceHydration: false,
    nodePosition: { x: 10, y: 20 },
  });

  assert.deepEqual(calls.slice(0, 4), [
    'commit',
    'update:prompt-1:{"isLoading":true,"error":undefined}',
    'add:image-1:410,20:Banana | draw',
    'add:image-2:410,450:Banana | draw',
  ]);
  assert.ok(calls.includes('edges:image-1,image-2'));
  assert.ok(calls.some((call) => call.includes('"imageUrl":"data:image/png;base64,draw"')));
  assert.ok(calls.includes('update:prompt-1:{"isLoading":false}'));
});

test('prompt generation runner resets and increments generatedCount progress per completed image', async () => {
  const progress: number[] = [];
  const runner = createPromptGenerationRunner({
    generateImage: async ({ prompt }) => `data:image/png;base64,${prompt}`,
    addNode: () => `image-${progress.length + 1}`,
    deleteNode: () => {},
    updateNodeData: () => {},
    setEdges: () => {},
    commitPrompt: () => {},
    now: () => '2026-04-27T00:00:00.000Z',
    onGeneratedCountChange: (count) => progress.push(count),
  });

  await runner.run({
    nodeId: 'prompt-1',
    prompt: 'draw',
    imageModel: 'banana',
    imageModelLabel: 'Banana',
    aspectRatio: '1:1',
    imageSize: '1K',
    batchCount: 3,
    referenceImageIds: [],
    referenceImages: [],
    hasPendingReferenceHydration: false,
    nodePosition: { x: 0, y: 0 },
  });

  assert.deepEqual(progress, [0, 1, 2, 3]);
});

test('prompt generation runner aborts the injected controller and passes its signal to generateImage', async () => {
  const controller = new AbortController();
  let abortCalled = false;
  const originalAbort = controller.abort.bind(controller);
  controller.abort = () => {
    abortCalled = true;
    originalAbort();
  };
  let receivedSignal: AbortSignal | undefined;
  let release!: () => void;
  const pending = new Promise<string>((resolve) => {
    release = () => resolve('data:image/png;base64,result');
  });
  const runner = createPromptGenerationRunner({
    generateImage: async ({ signal }) => {
      receivedSignal = signal;
      return pending;
    },
    addNode: () => 'image-1',
    deleteNode: () => {},
    updateNodeData: () => {},
    setEdges: () => {},
    commitPrompt: () => {},
    now: () => '2026-04-27T00:00:00.000Z',
    createAbortController: () => controller,
  });

  const runPromise = runner.run({
    nodeId: 'prompt-1',
    prompt: 'draw',
    imageModel: 'banana',
    imageModelLabel: 'Banana',
    aspectRatio: '1:1',
    imageSize: '1K',
    batchCount: 1,
    referenceImageIds: [],
    referenceImages: [],
    hasPendingReferenceHydration: false,
    nodePosition: { x: 0, y: 0 },
  });
  await new Promise((resolve) => setTimeout(resolve, 0));

  runner.abort();
  release();
  await runPromise;

  assert.equal(abortCalled, true);
  assert.equal(receivedSignal, controller.signal);
  assert.equal(controller.signal.aborted, true);
});

test('prompt generation runner deletes placeholders on abort', async () => {
  const calls: string[] = [];
  const abortError = Object.assign(new Error('aborted'), { name: 'AbortError' });
  const runner = createPromptGenerationRunner({
    generateImage: async () => {
      throw abortError;
    },
    addNode: () => {
      calls.push('add:image-1');
      return 'image-1';
    },
    deleteNode: (nodeId) => calls.push(`delete:${nodeId}`),
    updateNodeData: (nodeId, patch) => calls.push(`update:${nodeId}:${JSON.stringify(patch)}`),
    setEdges: (edges) => calls.push(`edges:${edges.length}`),
    commitPrompt: () => calls.push('commit'),
    now: () => '2026-04-27T00:00:00.000Z',
  });

  await runner.run({
    nodeId: 'prompt-1',
    prompt: 'draw',
    imageModel: 'banana',
    imageModelLabel: 'Banana',
    aspectRatio: '1:1',
    imageSize: '1K',
    batchCount: 1,
    referenceImageIds: [],
    referenceImages: [],
    hasPendingReferenceHydration: false,
    nodePosition: { x: 0, y: 0 },
  });

  assert.ok(calls.includes('delete:image-1'));
  assert.ok(calls.includes('update:prompt-1:{"isLoading":false}'));
});

test('prompt generation runner marks provider failures on placeholder and source node', async () => {
  const calls: string[] = [];
  const runner = createPromptGenerationRunner({
    generateImage: async () => {
      throw new Error('provider failed');
    },
    addNode: () => 'image-1',
    deleteNode: (nodeId) => calls.push(`delete:${nodeId}`),
    updateNodeData: (nodeId, patch) => calls.push(`update:${nodeId}:${JSON.stringify(patch)}`),
    setEdges: (edges) => calls.push(`edges:${edges.length}`),
    commitPrompt: () => calls.push('commit'),
    now: () => '2026-04-27T00:00:00.000Z',
  });

  await runner.run({
    nodeId: 'prompt-1',
    prompt: 'draw',
    imageModel: 'banana',
    imageModelLabel: 'Banana',
    aspectRatio: '1:1',
    imageSize: '1K',
    batchCount: 1,
    referenceImageIds: [],
    referenceImages: [],
    hasPendingReferenceHydration: false,
    nodePosition: { x: 0, y: 0 },
  });

  assert.ok(calls.some((call) => call === 'update:image-1:{"isLoading":false,"error":"provider failed"}'));
  assert.ok(calls.some((call) => call === 'update:prompt-1:{"error":"provider failed"}'));
});

test('prompt generation runner handles invalid Banana key and always clears loading', async () => {
  const calls: string[] = [];
  const runner = createPromptGenerationRunner({
    generateImage: async () => {
      throw new Error('API key not valid. Please pass a valid API key.');
    },
    addNode: () => 'image-1',
    deleteNode: (nodeId) => calls.push(`delete:${nodeId}`),
    updateNodeData: (nodeId, patch) => calls.push(`update:${nodeId}:${JSON.stringify(patch)}`),
    setEdges: (edges) => calls.push(`edges:${edges.length}`),
    commitPrompt: () => calls.push('commit'),
    removeApiKey: (key) => calls.push(`remove-key:${key}`),
    openSelectKey: () => calls.push('open-key-picker'),
    now: () => '2026-04-27T00:00:00.000Z',
  });

  await runner.run({
    nodeId: 'prompt-1',
    prompt: 'draw',
    imageModel: 'banana',
    imageModelLabel: 'Banana',
    aspectRatio: '1:1',
    imageSize: '1K',
    batchCount: 1,
    referenceImageIds: [],
    referenceImages: [],
    hasPendingReferenceHydration: false,
    nodePosition: { x: 0, y: 0 },
  });

  assert.ok(calls.includes('remove-key:custom_gemini_api_key'));
  assert.ok(calls.includes('open-key-picker'));
  assert.ok(calls.includes('update:prompt-1:{"isLoading":false}'));
});
```

- [ ] **Step 2: Write failing image action logic tests**

Create `src/components/nodes/useImageNodeActions.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildDownloadFileName,
  buildReferenceNodeData,
  canRerunImageNode,
  getRerunReferenceImages,
} from './useImageNodeActions';
import type { CanvasImageAsset } from '../../lib/canvasState';

test('canRerunImageNode disables rerun for mask edit results', () => {
  assert.equal(canRerunImageNode({ prompt: 'draw', generationMode: 'mask-edit' }), false);
  assert.equal(canRerunImageNode({ prompt: 'draw' }), true);
  assert.equal(canRerunImageNode({ prompt: '' }), false);
});

test('getRerunReferenceImages resolves saved reference assets', () => {
  const assets: Record<string, CanvasImageAsset> = {
    'ref-1': { id: 'ref-1', data: 'base64-ref', mimeType: 'image/png' },
  };

  assert.deepEqual(
    getRerunReferenceImages({ referenceImageIds: ['ref-1'] }, assets),
    [{ data: 'base64-ref', mimeType: 'image/png' }]
  );
});

test('buildReferenceNodeData carries current model options into a new prompt node', () => {
  assert.deepEqual(
    buildReferenceNodeData({
      imageModel: 'image2',
      bananaOptions: { thinkingLevel: 'HIGH' },
      image2Options: { quality: 'high' },
      referencePayload: { referenceImageIds: ['asset-1'] },
    }),
    {
      prompt: '',
      imageModel: 'image2',
      bananaOptions: undefined,
      image2Options: { quality: 'high' },
      referenceImageIds: ['asset-1'],
    }
  );
});

test('buildDownloadFileName uses banana-art prefix and png suffix', () => {
  assert.equal(buildDownloadFileName(1234), 'banana-art-1234.png');
});
```

- [ ] **Step 3: Run targeted tests and verify failure**

Run:

```bash
npx tsx --test src/components/nodes/usePromptGeneration.test.ts src/components/nodes/useImageNodeActions.test.ts
```

Expected: FAIL because the new hook modules do not exist.

- [ ] **Step 4: Implement prompt generation helpers and hook**

Create `src/components/nodes/usePromptGeneration.ts` with pure helpers and a hook that owns the current `PromptNode` generation workflow:

```ts
import { useRef, useState } from 'react';
import { generateImage } from '../../services/gemini';
import type { AppNode } from '../../store';
import type { InlineImageData } from '../../lib/canvasState';
import type { BananaOptions, Image2Options, ImageModelId } from '../../lib/imageModels';

export function buildGenerationReferenceData({
  referenceImageIds,
  referenceImages,
}: {
  referenceImageIds: string[];
  referenceImages: InlineImageData[];
}) {
  return referenceImageIds.length > 0
    ? { referenceImageIds }
    : referenceImages.length > 0
      ? { referenceImages }
      : {};
}

export function buildImagePlaceholderData({
  prompt,
  imageModel,
  imageModelLabel,
  aspectRatio,
  imageSize,
  bananaOptions,
  image2Options,
  createdAt,
  referenceData,
}: {
  prompt: string;
  imageModel: ImageModelId;
  imageModelLabel: string;
  aspectRatio: string;
  imageSize: string;
  bananaOptions: BananaOptions | undefined;
  image2Options: Image2Options | undefined;
  createdAt: string;
  referenceData: Partial<AppNode['data']>;
}): AppNode['data'] {
  return {
    prompt,
    imageModel,
    aspectRatio,
    imageSize,
    bananaOptions: imageModel === 'banana' ? bananaOptions : undefined,
    image2Options: imageModel === 'image2' ? image2Options : undefined,
    isLoading: true,
    error: undefined,
    createdAt,
    generationTitle: `${imageModelLabel} | ${prompt.slice(0, 28) || '生成任务'}`,
    ...referenceData,
  };
}

export function buildPromptGenerationEdges(sourceId: string, targetIds: string[]) {
  return targetIds.map((nodeId) => ({ id: `e-${sourceId}-${nodeId}`, source: sourceId, target: nodeId }));
}

export type PromptGenerationRunInput = {
  nodeId: string;
  prompt: string;
  imageModel: ImageModelId;
  imageModelLabel: string;
  aspectRatio: string;
  imageSize: string;
  bananaOptions?: BananaOptions;
  image2Options?: Image2Options;
  batchCount: number;
  referenceImageIds: string[];
  referenceImages: InlineImageData[];
  hasPendingReferenceHydration: boolean;
  nodePosition?: { x: number; y: number };
};

export type PromptGenerationRunnerDeps = {
  generateImage: (input: {
    prompt: string;
    imageModel: ImageModelId;
    aspectRatio: string;
    imageSize: string;
    bananaOptions?: BananaOptions;
    image2Options?: Image2Options;
    referenceImages?: Array<{ data: string; mimeType: string }>;
    referenceImageIds?: string[];
    signal?: AbortSignal;
  }) => Promise<string>;
  addNode: (type: 'imageNode', position: { x: number; y: number }, data: AppNode['data']) => string;
  deleteNode: (nodeId: string) => void;
  updateNodeData: (nodeId: string, patch: Partial<AppNode['data']>) => void;
  setEdges: (edges: ReturnType<typeof buildPromptGenerationEdges>) => void;
  commitPrompt: () => void;
  now: () => string;
  createAbortController?: () => AbortController;
  removeApiKey?: (key: string) => void;
  openSelectKey?: () => void;
  onGeneratedCountChange?: (count: number) => void;
};

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : '图像生成失败';
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === 'AbortError';
}

function isInvalidBananaKeyError(error: unknown) {
  return error instanceof Error && /API key not valid|API_KEY_INVALID|invalid api key/i.test(error.message);
}

export function createPromptGenerationRunner(deps: PromptGenerationRunnerDeps) {
  let isGenerating = false;
  let abortController: AbortController | null = null;

  return {
    get abortController() {
      return abortController;
    },
    async run(input: PromptGenerationRunInput) {
      const prompt = input.prompt.trim();
      if (!prompt || isGenerating) return;
      if (input.hasPendingReferenceHydration) {
        deps.updateNodeData(input.nodeId, { error: '参考图仍在加载中，请稍候' });
        return;
      }

      isGenerating = true;
      abortController = deps.createAbortController?.() ?? new AbortController();
      const createdNodeIds: string[] = [];
      let generatedCount = 0;

      try {
        deps.commitPrompt();
        deps.onGeneratedCountChange?.(0);
        deps.updateNodeData(input.nodeId, { isLoading: true, error: undefined });
        const referenceData = buildGenerationReferenceData({
          referenceImageIds: input.referenceImageIds,
          referenceImages: input.referenceImages,
        });
        const baseX = input.nodePosition ? input.nodePosition.x + 400 : 0;
        const baseY = input.nodePosition ? input.nodePosition.y : 0;
        const batchCount = Math.max(1, Math.floor(input.batchCount));

        for (let index = 0; index < batchCount; index += 1) {
          const nodeId = deps.addNode(
            'imageNode',
            { x: baseX, y: baseY + index * 430 },
            buildImagePlaceholderData({
              prompt,
              imageModel: input.imageModel,
              imageModelLabel: input.imageModelLabel,
              aspectRatio: input.aspectRatio,
              imageSize: input.imageSize,
              bananaOptions: input.bananaOptions,
              image2Options: input.image2Options,
              createdAt: deps.now(),
              referenceData,
            })
          );
          createdNodeIds.push(nodeId);
        }

        deps.setEdges(buildPromptGenerationEdges(input.nodeId, createdNodeIds));

        await Promise.all(createdNodeIds.map(async (nodeId) => {
          try {
            const imageUrl = await deps.generateImage({
              prompt,
              imageModel: input.imageModel,
              aspectRatio: input.aspectRatio,
              imageSize: input.imageSize,
              bananaOptions: input.bananaOptions,
              image2Options: input.image2Options,
              referenceImages: input.referenceImages.map((image) => ({ data: image.data, mimeType: image.mimeType })),
              referenceImageIds: input.referenceImageIds,
              signal: abortController?.signal,
            });
            deps.updateNodeData(nodeId, { imageUrl, isLoading: false, error: undefined });
            generatedCount += 1;
            deps.onGeneratedCountChange?.(generatedCount);
          } catch (error) {
            if (isAbortError(error)) {
              deps.deleteNode(nodeId);
              return;
            }
            const message = getErrorMessage(error);
            deps.updateNodeData(nodeId, { isLoading: false, error: message });
            deps.updateNodeData(input.nodeId, { error: message });
            if (input.imageModel === 'banana' && isInvalidBananaKeyError(error)) {
              deps.removeApiKey?.('custom_gemini_api_key');
              deps.openSelectKey?.();
            }
          }
        }));
      } finally {
        deps.updateNodeData(input.nodeId, { isLoading: false });
        abortController = null;
        isGenerating = false;
      }
    },
    abort() {
      abortController?.abort();
    },
  };
}

export function usePromptGeneration({
  nodeId,
  nodePosition,
  updateNodeData,
  addNode,
  deleteNode,
  setEdges,
  commitPrompt,
}: {
  nodeId: string;
  nodePosition?: { x: number; y: number };
  updateNodeData: (nodeId: string, patch: Partial<AppNode['data']>) => void;
  addNode: (type: 'imageNode', position: { x: number; y: number }, data: AppNode['data']) => string;
  deleteNode: (nodeId: string) => void;
  setEdges: (edges: ReturnType<typeof buildPromptGenerationEdges>) => void;
  commitPrompt: () => void;
}) {
  const [generatedCount, setGeneratedCount] = useState(0);
  const runnerRef = useRef<ReturnType<typeof createPromptGenerationRunner> | null>(null);
  if (!runnerRef.current) {
    runnerRef.current = createPromptGenerationRunner({
      generateImage,
      updateNodeData,
      addNode,
      deleteNode,
      setEdges,
      commitPrompt,
      now: () => new Date().toISOString(),
      removeApiKey: (key) => localStorage.removeItem(key),
      openSelectKey: () => window.aistudio?.openSelectKey?.(),
      onGeneratedCountChange: setGeneratedCount,
    });
  }

  return {
    generatedCount,
    setGeneratedCount,
    runGeneration: (input: Omit<PromptGenerationRunInput, 'nodeId' | 'nodePosition'>) => runnerRef.current!.run({ ...input, nodeId, nodePosition }),
    abortGeneration: () => runnerRef.current?.abort(),
  };
}
```

Refactor `PromptNode.tsx` so `handleGenerate` only collects current node settings and calls `runGeneration`. The hook module owns the async generation runner, abort handling, placeholder creation, provider calls, error updates, and loading cleanup. Keep these behaviors unchanged and covered by the runner tests above:

- empty prompt does not generate
- concurrent generate calls are ignored
- pending reference hydration blocks generate
- `commitPrompt` runs before placeholders are created
- batch count creates one image node per request at `y + index * 430`
- `generatedCount` resets to `0` at run start and increments once per completed image
- `abortGeneration` calls the active controller and passes the active signal to `generateImage`
- abort deletes aborted placeholders
- failed provider calls set placeholder errors and source prompt-node error
- invalid Banana key flow still removes `custom_gemini_api_key` or calls `window.aistudio.openSelectKey`
- final cleanup clears prompt node `isLoading`

- [ ] **Step 5: Implement image node action helpers and hook**

Create `src/components/nodes/useImageNodeActions.ts`:

```ts
import { useEffect, useRef, useState } from 'react';
import {
  createReferenceImagePayload,
  imageAssetFromDataUrl,
  resolveReferenceImages,
  type CanvasImageAsset,
} from '../../lib/canvasState';
import { generateImage } from '../../services/gemini';
import type { AppNode } from '../../store';
import { normalizeImageModel } from '../../lib/imageModels';

export function canRerunImageNode(data: Partial<AppNode['data']>) {
  return Boolean(data.prompt) && data.generationMode !== 'mask-edit';
}

export function getRerunReferenceImages(
  data: Partial<AppNode['data']>,
  assets: Record<string, CanvasImageAsset>
) {
  const referenceImages = resolveReferenceImages(data as AppNode['data'], assets);
  return referenceImages.length > 0
    ? referenceImages.map((image) => ({ data: image.data, mimeType: image.mimeType }))
    : undefined;
}

export function buildDownloadFileName(now = Date.now()) {
  return `banana-art-${now}.png`;
}

export function buildReferenceNodeData({
  imageModel,
  bananaOptions,
  image2Options,
  referencePayload,
}: {
  imageModel: AppNode['data']['imageModel'];
  bananaOptions: AppNode['data']['bananaOptions'];
  image2Options: AppNode['data']['image2Options'];
  referencePayload: Partial<AppNode['data']>;
}): AppNode['data'] {
  const normalizedModel = normalizeImageModel(imageModel);
  return {
    prompt: '',
    imageModel: normalizedModel,
    bananaOptions: normalizedModel === 'banana' ? bananaOptions : undefined,
    image2Options: normalizedModel === 'image2' ? image2Options : undefined,
    ...referencePayload,
  };
}

export function useImageNodeActions() {
  const [copiedImage, setCopiedImage] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const rerunAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      rerunAbortRef.current?.abort();
    };
  }, []);

  return {
    copiedImage,
    copiedPrompt,
    isRegenerating,
    setCopiedImage,
    setCopiedPrompt,
    setIsRegenerating,
    rerunAbortRef,
    generateImage,
    createReferenceImagePayload,
    imageAssetFromDataUrl,
  };
}
```

Refactor `ImageNode.tsx` to import `canRerunImageNode`, `getRerunReferenceImages`, `buildDownloadFileName`, `buildReferenceNodeData`, and `useImageNodeActions`. Keep control titles, hover behavior, copy timers, download behavior, rerun abort behavior, and create-reference-node position unchanged.

- [ ] **Step 6: Keep compatibility exports**

Because `ImageNode.test.tsx` currently imports `canRerunImageNode` and `getRerunReferenceImages` from `ImageNode`, re-export them from `ImageNode.tsx`:

```ts
export {
  canRerunImageNode,
  getRerunReferenceImages,
} from './useImageNodeActions';
```

This avoids changing consumers while allowing future tests to import the focused module directly.

- [ ] **Step 7: Update README module tree for node hooks**

In README's `src/components/nodes/` listing, add:

```text
│  │  │  ├─ useReferenceImages.ts  # 参考图解析、上传/粘贴与上限控制
│  │  │  ├─ usePromptGeneration.ts # 提示词节点生成流程
│  │  │  ├─ useImageNodeActions.ts # 图片节点复制、下载、重跑与参考节点动作
│  │  │  └─ useMaskGeneration.ts   # Image2 局部编辑共享请求逻辑
```

- [ ] **Step 8: Run targeted tests**

Run:

```bash
npx tsx --test src/components/nodes/usePromptGeneration.test.ts src/components/nodes/useImageNodeActions.test.ts src/components/nodes/useReferenceImages.test.ts src/components/nodes/useMaskGeneration.test.ts src/components/nodes/ImageNode.test.tsx src/components/nodes/GeneratingImagePlaceholder.test.tsx src/services/gemini.test.ts src/lib/canvasState.test.ts
```

Expected: PASS.

- [ ] **Step 9: Run final verification**

Run:

```bash
npm run check
```

Expected: PASS for `npm run lint`, `npm test`, and `npm run build`.

- [ ] **Step 10: Commit**

```bash
git add README.md src/components/nodes/usePromptGeneration.ts src/components/nodes/usePromptGeneration.test.ts src/components/nodes/useImageNodeActions.ts src/components/nodes/useImageNodeActions.test.ts src/components/nodes/PromptNode.tsx src/components/nodes/ImageNode.tsx src/components/nodes/ImageNode.test.tsx
git commit -m "refactor: extract node generation and image actions"
```

## Final Self-Review Checklist

- [ ] Package rename is covered by Task 1 for both `package.json` and `package-lock.json`.
- [ ] `npm test`, `npm run check`, and README script documentation are covered by Tasks 1, 5, and 8.
- [ ] Request validation is covered by Tasks 2 and 3, including `referenceImages` precedence over `referenceImage`, max four effective references, malformed image payloads, mask restrictions, and `400` route behavior.
- [ ] Server split is covered by Tasks 3, 4, and 5 for routes, providers, proxy, validation, app factory, and thin bootstrap.
- [ ] Project create, rename, and delete dialogs are covered by Task 6 using pure logic and static markup tests.
- [ ] Node workflow extraction is covered by Tasks 7 and 8 for reference images, prompt generation, image actions, and shared mask generation.
- [ ] Existing behavior compatibility is checked through targeted tests, TypeScript lint, existing relevant tests, and final `npm run check`.
- [ ] No task adds `jsdom`, `happy-dom`, Testing Library, or a new DOM test framework.
- [ ] No step requires manual human prompting between implementation tasks.
