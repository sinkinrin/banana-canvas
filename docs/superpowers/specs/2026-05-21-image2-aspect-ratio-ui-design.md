# Image2 Aspect Ratio UI Design

## Goal

Prevent users from selecting aspect ratios that do not actually affect Image2 output.

## Current Behavior

The prompt node exposes the full Banana aspect ratio list for both Banana and Image2. Image2 generation later maps those ratios into only three output shapes: square, landscape, and portrait. Unsupported choices such as `21:9` and `4:5` appear selectable but produce square Image2 requests.

## Design

When the selected image model is `image2`, the prompt settings aspect ratio select only shows ratios that map directly to Image2 output shapes:

- `1:1`
- `4:3`
- `16:9`
- `3:4`
- `9:16`

When the selected image model is `banana`, the select continues to show the full `BANANA_ASPECT_RATIO_VALUES` list.

If an existing node has an unsupported aspect ratio while `image2` is active, the UI uses `1:1` as the effective selection. New generation payloads and generated image node metadata therefore use the supported effective value instead of preserving a misleading unsupported value.

Prompt reference mask edits always generate through Image2, even when the prompt node is currently set to Banana. Those mask-edit requests and generated image node metadata use the Image2-effective ratio, so a Banana prompt node stored as `21:9` produces an Image2 mask edit with `1:1`.

## Testing

Add pure helper tests for:

- Banana exposes all aspect ratios.
- Image2 exposes only supported ratios.
- Image2 falls back unsupported stored ratios to `1:1`.
- Banana preserves supported Banana-specific ratios.
- Image2 mask edits fall back Banana-only stored ratios to `1:1`.
