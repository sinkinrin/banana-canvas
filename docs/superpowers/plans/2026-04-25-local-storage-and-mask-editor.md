# Local Storage And Mask Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store projects in local files, migrate existing IndexedDB data, then add Image2 mask editing and original/new comparison.

**Architecture:** Add a server-side file project store and HTTP API, then route project pages through a repository abstraction. Extend canvas image assets to preserve mask-edit source relationships, add a shared mask editor modal, and send Image2 multipart `mask` with the masked source image first.

**Tech Stack:** Node `fs/promises`, Express, React 19, Zustand, React Flow, `node:test`, TypeScript, IndexedDB fallback through `idb-keyval`.

---

### Task 1: Server Local File Store

**Files:**
- Create: `src/lib/localProjectStore.ts`
- Modify: `server.ts`
- Test: `src/lib/localProjectStore.test.ts`

- [ ] Write failing tests for saving/loading project snapshots, asset file round-trip, and path traversal rejection.
- [ ] Implement atomic JSON writes, project id validation, asset file encode/decode, index read/write, and project delete.
- [ ] Register Express routes under `/api/projects`.
- [ ] Run `npx tsx --test src/lib/localProjectStore.test.ts`.

### Task 2: Frontend Project Repository

**Files:**
- Create: `src/lib/projectRepository.ts`
- Modify: `src/pages/ProjectsPage.tsx`
- Modify: `src/pages/ProjectCanvasPage.tsx`
- Test: `src/lib/projectRepository.test.ts`

- [ ] Write failing tests for local API success, local API failure fallback, and IndexedDB-to-local migration.
- [ ] Implement `createProjectRepository()` with local API primary, IndexedDB fallback, and migration.
- [ ] Update project pages to use repository operations.
- [ ] Run `npx tsx --test src/lib/projectRepository.test.ts src/lib/projectStorage.test.ts`.

### Task 3: Canvas State For Mask Results

**Files:**
- Modify: `src/lib/canvasState.ts`
- Modify: `src/store.ts`
- Test: `src/lib/canvasState.test.ts`

- [ ] Write failing tests that `sourceImage` is extracted into `sourceImageAssetId` and pruning keeps source assets.
- [ ] Add `sourceImageAssetId`, `sourceImage`, `sourcePrompt`, and `generationMode` to node data.
- [ ] Extend normalization, snapshot sanitization, and referenced asset collection.
- [ ] Run `npx tsx --test src/lib/canvasState.test.ts`.

### Task 4: Image2 Mask Payload

**Files:**
- Modify: `src/services/gemini.ts`
- Modify: `server.ts`
- Test: `src/services/gemini.test.ts`
- Test: `src/lib/imageModels.test.ts`

- [ ] Write failing tests that frontend payload includes `maskImage` and server multipart appends `mask`.
- [ ] Add `maskImage` to generate payload and server request type.
- [ ] Reject Banana2 mask requests.
- [ ] Append multipart `mask` when Image2 edit requests include a mask.
- [ ] Run `npx tsx --test src/services/gemini.test.ts src/lib/imageModels.test.ts`.

### Task 5: Mask Editor UI

**Files:**
- Create: `src/components/mask/MaskEditorModal.tsx`
- Create: `src/components/mask/MaskCompareModal.tsx`
- Modify: `src/components/nodes/PromptNode.tsx`
- Modify: `src/components/nodes/ImageNode.tsx`
- Test: `src/components/mask/MaskEditorModal.test.tsx`
- Test: `src/components/nodes/GeneratingImagePlaceholder.test.tsx`

- [ ] Write failing component tests for editor controls, disabled generate without prompt/mask, and compare action visibility.
- [ ] Implement canvas painting with brush, eraser, undo, clear, and same-size PNG alpha export.
- [ ] Add reference thumbnail mask entry.
- [ ] Add generated image mask entry and compare entry.
- [ ] Generate a new ImageNode with `generationMode: 'mask-edit'` and source image metadata.
- [ ] Run component tests.

### Task 6: Full Verification

**Files:**
- No production edits unless verification finds defects.

- [ ] Run all tests with `npx tsx --test "src/**/*.test.ts" "src/**/*.test.tsx"`.
- [ ] Run `npm run lint`.
- [ ] Run `npm run build`.
- [ ] Start the app on a free port and smoke test project creation, reload, local file persistence, mask editor entry points, mask generation request shape, and compare modal.
- [ ] Do a code review pass for path safety, storage data loss risks, mask dimensions, and UI regression.
