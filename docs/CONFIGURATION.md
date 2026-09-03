# Configuration

This guide contains the provider, network, limit, and storage details intentionally kept out of the main README.

## App settings

Open **App settings** from either the project list or a project canvas. Changes are validated, saved, and applied without restarting the local server.

The settings screen manages:

- Image2 Base URL, API Key, model, and endpoint type
- Image2 proxy mode, SSE streaming, partial images, attempts, and timeout
- Gemini API Key, prompt optimizer model, and the separate Banana/Gemini proxy
- Interface language
- Desktop software updates

In Electron, secrets are kept in `safeStorage` when operating-system encryption is available. The renderer receives only whether each Key is configured. npm development continues to support repository-local `.env` settings.

## Models

| UI model | API model / route | Output sizes | Best suited for |
| --- | --- | --- | --- |
| Image2 | Configured OpenAI-compatible relay | `512`–`4K` options | Default generation and mask editing |
| Banana 2 | `gemini-3.1-flash-image` | `512`, `1K`, `2K`, `4K` | General multi-reference work |
| Banana 2 Lite | `gemini-3.1-flash-lite-image` | `1K` | Fast, economical drafts and batches |
| Banana Pro | `gemini-3-pro-image` | `1K`, `2K`, `4K` | Complex design, typography, and factual visuals |

Banana 2 and Banana 2 Lite support all 14 exposed aspect ratios and selectable `MINIMAL` / `HIGH` thinking levels. Banana Pro supports the 10 standard aspect ratios, manages thinking internally, and does not accept `mediaResolution`. Google Search grounding is available for Banana 2 and Banana Pro.

Image2 automatically chooses `/v1/images/generations` or `/v1/images/edits` for `gpt-image-*` models and `/v1/chat/completions` for other model names. Override that detection with `IMAGE2_ENDPOINT_TYPE=images` or `IMAGE2_ENDPOINT_TYPE=chat` when required by a relay.

Prompt optimization defaults to the production-ready `gemini-3.8-flash`. Change it in **App settings** or with `GEMINI_PROMPT_OPTIMIZER_MODEL`; the configured model must support Gemini `generateContent` for the current API Key.

## References and generation limits

- A creation node accepts at most 4 reference images.
- Each reference may be up to 16 MiB.
- References plus an optional mask may total up to 40 MiB.
- A composition sketch uses one reference slot. Reapplying the same sketch replaces its earlier asset.
- Sketches are exported as fixed-aspect PNGs with a 2048-pixel long edge; their editable QuickDraw snapshot stays in the project.
- Batch count options are `1`, `2`, and `4`. Multiple outputs are implemented as multiple generation requests.

## Image2 options

The UI exposes the relay options that are currently used by the application:

- `quality`
- `output_format`
- `output_compression` for JPEG and WebP
- `response_format`
- `partial_images`

Background is fixed to `opaque`, moderation to `low`, and streaming follows the runtime setting. `gpt-image-2` does not expose a transparent-background or `input_fidelity` toggle here. Mask edits upload the source and same-sized PNG mask to the Images endpoint.

## Environment variables

Except for startup-only settings noted below, runtime settings are watched and hot-reloaded from `.env`.

| Variable | Purpose |
| --- | --- |
| `IMAGE2_BASE_URL` | Image2 relay API base URL, such as `https://example.com/v1` |
| `IMAGE2_CHAT_COMPLETIONS_URL` | Optional full chat-completions URL used when the base URL is absent |
| `IMAGE2_API_KEY` | Image2 relay API Key |
| `IMAGE2_MODEL` | Model name sent to the Image2 relay |
| `IMAGE2_ENDPOINT_TYPE` | `auto`, `images`, or `chat` endpoint selection |
| `IMAGE2_HTTPS_PROXY` | Optional Image2-specific proxy URL |
| `IMAGE2_PROXY_MODE` | `direct`, `auto`, or `proxy`; defaults to `direct` |
| `IMAGE2_MAX_ATTEMPTS` | Maximum attempts, default `1`; higher values may duplicate generation cost |
| `IMAGE2_HEDGE_ENABLED` | Enables proxy/direct racing when attempts are greater than one; off by default |
| `IMAGE2_STREAM` | Enables SSE for compatible Images endpoints |
| `IMAGE2_PARTIAL_IMAGES` | Number of streamed partial images, `0`–`3` |
| `IMAGE2_REQUEST_TIMEOUT_MS` | Per-attempt timeout, default `240000` |
| `IMAGE2_RETRY_DELAY_MS` | Delay between Image2 attempts, default `1000` |
| `IMAGE2_PROXY_CONNECT_TIMEOUT_MS` | Proxy connection timeout, default `60000` |
| `IMAGE2_DIRECT_CONNECT_TIMEOUT_MS` | Direct connection timeout, default `60000` |
| `IMAGE2_DIRECT_ALLOW_H2` | Allows HTTP/2 on direct Image2 requests, default `true` |
| `GEMINI_API_KEY` | Key for Banana models and Gemini prompt optimization |
| `GEMINI_PROMPT_OPTIMIZER_MODEL` | Model used by the prompt Optimize action; default `gemini-3.8-flash` |
| `GEMINI_HTTPS_PROXY` | Separate Banana/Gemini proxy URL |
| `GEMINI_PROXY_ENABLED` | Explicitly enables the Banana/Gemini proxy; default `false` |
| `HTTPS_PROXY` / `HTTP_PROXY` | Compatibility fallback for Image2 only |
| `PORT` | Startup-only server port, default `3000` |
| `HOST` | Startup-only bind address, default `127.0.0.1` |
| `NODE_ENV` | Startup-only runtime mode |
| `BANANA_DATA_DIR` | Startup-only local data directory, default `./data` |

Invalid runtime changes are rejected and the last valid configuration remains active. Electron can repair invalid legacy fields and migrate old plaintext API Keys into encrypted storage.

## Proxy isolation

Image2 and Gemini use separate network paths:

- Image2 follows `IMAGE2_PROXY_MODE` and its optional dedicated proxy.
- Banana generation and prompt optimization use `GEMINI_HTTPS_PROXY` only when `GEMINI_PROXY_ENABLED=true`.
- Enabling one provider's proxy does not route the other provider through it.

## Local storage

- npm mode: `data/projects/` and `data/prompt-library.json`
- Electron mode: the current user's application-data directory
- Browser fallback: IndexedDB when the local projects API is unavailable

Projects store canvas metadata separately from deduplicated image assets. Unreferenced assets are pruned, unchanged files are reused through size and SHA-256 metadata, and deleted local projects are first moved to a recoverable `.trash/` directory.

The current autosave API still sends a full canvas snapshot. Projects containing many large images can therefore produce larger save requests after node or prompt changes.

## Desktop updates

Automatic updates are off by default. When enabled, the installed app checks every 4 hours and downloads an available update in the background. Installation still requires a user decision to restart immediately or defer until exit.

Windows installers are unsigned. Both manual installation and in-app updates may trigger a SmartScreen **Unknown publisher** warning.
