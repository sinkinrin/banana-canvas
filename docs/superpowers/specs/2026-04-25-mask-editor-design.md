# Image2 Mask Editor Design

## Goal

Add Image2 local mask editing so both uploaded reference images and generated images can be partially edited, then compare the original image against the regenerated result.

## Confirmed Scope

- Add a mask edit entry point on PromptNode reference image thumbnails.
- Add a mask edit entry point on ImageNode generated image hover actions.
- Use one shared mask editor modal for both entry points.
- In the editor, show the source image as the base layer and draw the mask as a translucent overlay.
- Support brush, eraser, brush size, undo, clear, prompt input, cancel, and generate.
- Send the source image as the first `image` and the exported alpha PNG as `mask` to Image2 `/images/edits`.
- If the PromptNode already has other reference images, send them after the masked source image as additional `image` fields.
- After generation, create a result that can show original/new comparison.
- Allow continuing mask edits from the generated result.

## Non-Goals

- Do not build a full independent layer/history workspace.
- Do not persist unfinished mask brush strokes.
- Do not support multiple concurrent mask drafts per image.
- Do not add mask support for Banana2, because the current Banana2 path does not expose an official mask parameter.

## Current Persistence Model

The app uses local file storage when the Express API is available and falls back to IndexedDB when it is not.

- Default local storage root: `data/projects/`.
- Optional local storage override: `BANANA_DATA_DIR`.
- Legacy IndexedDB project index key: `banana-projects-index`.
- Legacy IndexedDB project snapshot key: `banana-project:<projectId>`.
- Legacy single-canvas key: `banana-art-storage`.
- Legacy asset key: `banana-art-assets`.
- API key override: `custom_gemini_api_key` in `localStorage`.

Each project snapshot stores `nodes`, `edges`, and `assets`. Local file storage writes image assets as files under each project `assets/` directory and stores node references by asset id. IndexedDB fallback stores image binary data as base64 assets keyed by asset id. Autosave exports the current canvas to the active project snapshot.

## Persistence Strategy For Mask Editing

Persist only durable outputs and relationships:

- Persist source images and generated images as normal `CanvasImageAsset` records.
- Store the generated image node's source image relationship so compare view can resolve original vs new image.
- Store enough node metadata to know the result came from a mask edit.

Do not persist transient editor state:

- Brush strokes before clicking generate.
- Undo stack.
- In-progress mask canvas.
- Temporary object URLs.

This keeps storage bounded and fits the existing prune-by-referenced-assets model.

## Data Model Additions

Extend `CanvasNodeData` with optional fields:

- `sourceImageAssetId?: string` for comparison when the original source image is already an asset.
- `sourceImage?: InlineImageData | null` as a temporary migration/input convenience for non-asset data URLs.
- `sourcePrompt?: string` for the mask edit prompt shown in comparison context.
- `generationMode?: 'standard' | 'mask-edit'` to distinguish generated results.

The normalization layer will convert `sourceImage` into `sourceImageAssetId`, similar to existing `referenceImages` and `imageUrl` handling.

## UI Flow

Reference image flow:

1. User opens a PromptNode with Image2 selected.
2. Each reference thumbnail shows a small mask edit action.
3. Clicking it opens the shared mask editor with that reference as the source.
4. On generate, the result is added as a new ImageNode near the PromptNode.
5. The new ImageNode stores the original source for comparison.

Generated image flow:

1. User hovers an ImageNode.
2. The hover toolbar shows a local edit action.
3. Clicking it opens the same mask editor with the generated image as source.
4. On generate, the result is added as a new ImageNode near the original.
5. The new ImageNode stores the original source for comparison and can be edited again.

Comparison flow:

1. A mask-edit result ImageNode shows a compare action.
2. The compare modal displays original and new image side by side.
3. The modal offers actions to close, continue editing the new image, or use the new image as reference.

## API Flow

Add a `maskImage` field to the frontend generate payload:

```ts
maskImage?: {
  data: string;
  mimeType: 'image/png';
}
```

When `maskImage` is present:

- Force Image2 images endpoint.
- Require at least one reference image.
- Put the masked source image first in `referenceImages`.
- Append `mask` to multipart form data.
- Preserve existing supported Image2 options such as `quality`, `background`, `output_format`, `stream`, and `partial_images`; omit `input_fidelity` for `gpt-image-2` because it is not configurable.

The server should reject `maskImage` for Banana2 with a clear error.

## Mask Export Semantics

The editor exports a PNG with the same pixel dimensions as the source image:

- Fully transparent pixels mean the area is selected for edit by the Image2 edits API.
- Opaque white pixels mean the area should be preserved as unmasked context.
- The visible editor overlay uses project amber for user feedback, but export uses alpha mask semantics.

## Error Handling

- Disable generate until a prompt is present and at least one mask stroke exists.
- Show an inline editor error if the source image cannot be loaded.
- Show an inline editor error if mask export fails.
- Reuse existing Image2 request errors for relay/API failures.
- Keep the modal open when generation fails so the user can retry without repainting.

## Testing Strategy

- Unit test canvas state normalization for `sourceImage` to `sourceImageAssetId`.
- Unit test project snapshot persistence keeps comparison source assets.
- Unit test frontend payload includes `maskImage`.
- Unit test server multipart request appends `mask` when provided.
- Component test the mask editor controls render and enforce prompt/mask requirements.
- Component test ImageNode shows compare action only when comparison source exists.
- Browser smoke test: open editor from a generated image, paint mask, generate, see compare UI.

## Open Decisions

- Use a modal editor rather than a full-screen workspace for the first version.
- Keep mask drafts transient; draft persistence is out of scope for this version.
- Keep comparison as side-by-side first; slider comparison is out of scope for this version.
