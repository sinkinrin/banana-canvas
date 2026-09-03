<div align="center">
  <img src="docs/images/canvas-workflow.png" alt="Banana Canvas workflow" width="1200" />

  <h1>Banana Canvas</h1>
  <p>A local-first infinite canvas for iterative AI image creation.</p>
</div>

> [!IMPORTANT]
> 🇨🇳 **简体中文：[阅读中文 README](README_CN.md)**

Current version: `0.6.0`

See [CHANGELOG.md](CHANGELOG.md) for version history and [docs/RELEASING.md](docs/RELEASING.md) for the maintainer release process.

Banana Canvas turns image generation into a visual workflow. Arrange prompt and image nodes on an infinite canvas, connect results as references, branch ideas, and keep every iteration inside a local project.

## Highlights

- **Visual generation workflow** — build and rearrange prompt-to-image flows with React Flow.
- **Multiple image models** — use Image2 by default, or switch to Banana 2, Banana 2 Lite, and Banana Pro.
- **Reference-driven iteration** — upload or paste up to four references, then reuse any result in the next step.
- **Composition sketches** — draw subject positions, actions, arrows, and framing before generating.
- **Mask editing** — paint the area to change and compare the Image2 result with the original.
- **Reusable prompt library** — save, search, tag, and apply prompts across projects.
- **Local-first projects** — persist canvases, relationships, and image assets on your own machine.
- **English and Simplified Chinese UI** — follow the system language on first launch and remember manual changes.

## Preview

<table>
  <tr>
    <td width="50%"><img src="docs/images/project-list.png" alt="Local project list" /></td>
    <td width="50%"><img src="docs/images/prompt-settings.png" alt="Prompt node and model settings" /></td>
  </tr>
  <tr>
    <td align="center"><sub>Local projects</sub></td>
    <td align="center"><sub>Prompt and model controls</sub></td>
  </tr>
</table>

<details>
  <summary><strong>See the Image2 mask editor</strong></summary>
  <br />
  <img src="docs/images/mask-editor.png" alt="Image2 mask editor" width="900" />
</details>

## Quick start

Requirements:

- Node.js 22.17.1 or newer
- An Image2/OpenAI-compatible relay; a Gemini API Key is optional for Banana models and prompt optimization

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), select **App settings**, and enter the Image2 Base URL, API Key, and model name. Saved settings apply immediately.

To launch the Electron desktop app from source:

```bash
npm run electron
```

Only browsing projects, arranging a canvas, and viewing saved images works without an API Key.

## Basic workflow

1. Create a project and open **App settings** to configure a model connection.
2. Add a creation node from the bottom toolbar or the canvas context menu.
3. Enter a prompt and optionally upload, paste, or sketch reference images.
4. Choose a model, aspect ratio, resolution, count, and model-specific options.
5. Generate images, then branch from a result or use mask editing for targeted changes.
6. Use auto layout, fit-to-view, undo, redo, and the prompt library as the canvas grows.

## Language

The interface currently supports:

- English (`en`)
- Simplified Chinese (`zh-CN`)

Banana Canvas follows the operating-system language the first time it starts. Change it at any time with the language selector in **App settings**; the choice is stored locally. Translation resources live in [`src/i18n/locales`](src/i18n/locales).

## Configuration

The recommended path is **App settings**, which keeps saved desktop API Keys in Electron `safeStorage`. Development environments may instead copy `.env.example` to `.env`:

```bash
IMAGE2_BASE_URL=https://example.com/v1
IMAGE2_API_KEY=your_key
IMAGE2_MODEL=gpt-image-2
GEMINI_API_KEY=optional_gemini_key
GEMINI_PROMPT_OPTIMIZER_MODEL=gemini-3.8-flash
```

Read [Configuration](docs/CONFIGURATION.md) for provider behavior, proxies, limits, storage, and the complete environment-variable reference.

## Local data and security

- npm development stores projects under `data/projects/` and prompts in `data/prompt-library.json`.
- Electron stores projects and settings in the current user's application-data directory.
- Saved desktop Keys are encrypted with the operating system's credential storage when available and are never returned to the renderer.
- The server binds to `127.0.0.1` by default. Do not expose it publicly; the local API has no public-deployment authentication layer.
- Automatic updates are off by default; enabling them downloads updates in the background but still asks before restarting.
- Windows installers are currently unsigned, so SmartScreen may show an **Unknown publisher** warning.

## Documentation

| Document | Contents |
| --- | --- |
| [Configuration](docs/CONFIGURATION.md) | Models, app settings, proxies, limits, and environment variables |
| [Development](docs/DEVELOPMENT.md) | Scripts, architecture, data layout, and verification |
| [Roadmap](docs/ROADMAP.md) | Planned canvas and project evolution |
| [Changelog](CHANGELOG.md) | User-visible changes by version |
| [Releasing](docs/RELEASING.md) | Maintainer-only release checklist |

## Verification

```bash
npm test
npm run check
```

`npm install` is the initial dependency setup step. `npm run check` validates the existing checkout and does not run `npm install` for you.

For the full command list and desktop smoke tests, see [Development](docs/DEVELOPMENT.md).
