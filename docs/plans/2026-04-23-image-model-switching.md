# Image Model Switching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-node image model selection so existing banana generation and the new image2 relay can be selected independently for each generation node.

**Architecture:** Keep the frontend generation API unified while storing `imageModel` in node metadata. Add a small shared model registry plus an image2 chat-completions adapter; the Express endpoint routes each request to the selected adapter and always returns `{ imageUrl }`. The UI model id is `image2`; the relay model defaults to `gpt-image-2`.

**Tech Stack:** React 19, TypeScript, Express, `@google/genai`, node:test, tsx

---

### Task 1: Shared Model Registry And Image2 Adapter

**Files:**
- Create: `src/lib/imageModels.ts`
- Test: `src/lib/imageModels.test.ts`

- [ ] Write tests for model normalization, config lookup, image2 request body construction, and image extraction.
- [ ] Run `npx tsx --test src/lib/imageModels.test.ts` and verify the tests fail because the module does not exist.
- [ ] Implement `banana` and `image2` model metadata plus image2 request/response helpers.
- [ ] Re-run `npx tsx --test src/lib/imageModels.test.ts` and verify the tests pass.

### Task 2: Persist Model Metadata And Frontend Payload

**Files:**
- Modify: `src/lib/canvasState.ts`
- Modify: `src/services/gemini.ts`
- Test: `src/lib/canvasState.test.ts`
- Test: `src/services/gemini.test.ts`

- [ ] Add failing tests that snapshots preserve `imageModel` and generation payloads include normalized model ids.
- [ ] Implement `imageModel` in `CanvasNodeData` snapshots and `GenerateImageParams`.
- [ ] Re-run targeted tests and verify they pass.

### Task 3: UI And Server Routing

**Files:**
- Modify: `src/components/nodes/PromptNode.tsx`
- Modify: `src/components/nodes/ImageNode.tsx`
- Modify: `server.ts`
- Modify: `.env.example`
- Modify: `README.md`

- [ ] Add the model selector to prompt node settings.
- [ ] Pass selected model into generation and store it on image nodes.
- [ ] Make image node rerun use the saved model.
- [ ] Route `/api/generate-image` to Gemini for `banana` and the image2 relay for `image2`.
- [ ] Run targeted tests, `npm run lint`, and `npm run build`.
