# Image2 Aspect Ratio UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restrict Image2 aspect ratio choices to values that actually map to Image2 output sizes.

**Architecture:** Extract prompt aspect ratio selection logic into a small pure helper beside `PromptNode`. `PromptNode` consumes the helper for both the select options and the effective aspect ratio used by generation.

**Tech Stack:** React, TypeScript, Node test runner.

---

### Task 1: Prompt Aspect Ratio Options

**Files:**
- Create: `src/components/nodes/promptAspectRatios.ts`
- Create: `src/components/nodes/promptAspectRatios.test.ts`
- Modify: `src/components/nodes/PromptNode.tsx`

- [x] **Step 1: Write the failing helper tests**

Add tests that import `getPromptAspectRatioOptions`, `getEffectivePromptAspectRatio`, and `getImage2MaskEditAspectRatio`. Assert Banana returns `BANANA_ASPECT_RATIO_VALUES`, Image2 returns `['1:1', '4:3', '16:9', '3:4', '9:16']`, Image2 maps `21:9` to `1:1`, Banana preserves `21:9`, and Image2 mask edits map Banana-only stored `21:9` to `1:1`.

- [x] **Step 2: Run the focused test**

Run: `npx tsx --test src/components/nodes/promptAspectRatios.test.ts`

Expected: FAIL because `promptAspectRatios.ts` does not exist.

- [x] **Step 3: Implement the helper**

Create the helper with `IMAGE2_ASPECT_RATIO_VALUES`, `getPromptAspectRatioOptions(imageModel)`, `getEffectivePromptAspectRatio(imageModel, value)`, and `getImage2MaskEditAspectRatio(value)`.

- [x] **Step 4: Wire PromptNode**

Use `getEffectivePromptAspectRatio(imageModel, data.aspectRatio)` for the current `aspectRatio`, `getPromptAspectRatioOptions(imageModel)` for rendered options, and `getImage2MaskEditAspectRatio(data.aspectRatio)` for Image2-only prompt reference mask edits.

- [x] **Step 5: Verify**

Run: `npx tsx --test src/components/nodes/promptAspectRatios.test.ts`

Expected: PASS.

Run: `npm run lint`

Expected: PASS.
