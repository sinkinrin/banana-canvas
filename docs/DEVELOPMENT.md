# Development

## Setup

Install dependencies once, then start the local Express and Vite environment:

```bash
npm install
npm run dev
```

The development server listens on `127.0.0.1:3000` by default. Set `HOST=0.0.0.0` only for an explicitly trusted LAN environment; the API is not designed for public deployment.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start Express and Vite middleware for full local development |
| `npm run build` | Build renderer assets into `dist/` |
| `npm run build:electron` | Bundle the Electron main process and preload bridge |
| `npm run electron` | Build and launch Electron from source |
| `npm test` | Run all `src/**/*.test.ts` and `src/**/*.test.tsx` tests |
| `npm run typecheck` | Run TypeScript without emitting files |
| `npm run lint` | Run ESLint across renderer, server, and Electron TypeScript |
| `npm run check` | Run version metadata, types, lint, tests, web build, and Electron build |
| `npm run smoke:electron` | Exercise the source-built desktop application in a hidden window |
| `npm run dist:win` | Build the Windows x64 NSIS installer into `release/` |
| `npm run smoke:electron:packaged` | Smoke-test the packaged Windows application |
| `npm run version:check` | Verify package, lockfile, READMEs, and Changelog versions |
| `npm run release:prepare -- vX.Y.Z` | Validate release metadata and generated update files |

`npm run check` intentionally does not install dependencies. Run `npm install` or `npm ci` first in a fresh checkout.

## Architecture

```text
src/
├── components/       Canvas nodes, dialogs, editors, and settings
├── i18n/             Locale detection, persistence, and translation resources
├── lib/              Domain models, persistence helpers, validation, and utilities
├── pages/            Project list and project canvas routes
├── server/           Express routes, runtime settings, and generation providers
├── services/         Renderer-side local API clients
└── store.ts          Zustand canvas state with zundo history

electron/
├── main.ts           Desktop lifecycle, local server, smoke flow, and native bridges
├── preload.ts        Isolated renderer bridge
└── updateManager.ts  Desktop update state machine
```

The renderer uses React 19, React Flow, Zustand, and zundo. The local server owns model credentials and provider requests. Electron starts the same server on an ephemeral loopback port and keeps the installation directory read-only.

## Internationalization

The renderer uses `i18next` and `react-i18next`. Locale resources are in:

- `src/i18n/locales/en.ts`
- `src/i18n/locales/zh-CN.ts`

The English resource defines the canonical locale shape; TypeScript requires the Simplified Chinese resource to provide the same tree. Components import `useAppTranslation` from `src/i18n` so direct component tests and the application entry share one initialized instance.

When adding a locale:

1. Add a complete resource file under `src/i18n/locales/`.
2. Extend `SUPPORTED_LANGUAGES` and the resource map in `src/i18n/index.ts`.
3. Add the language to `LanguageSelector.tsx`.
4. Verify interpolation, the language selector, representative screens, and Electron smoke behavior.

Do not use translated UI text as an automation selector. Add a stable `data-*`, `name`, or semantic role instead.

## Persistence boundaries

- Canvas state and up to 50 undo/redo snapshots live in Zustand/zundo.
- Local projects use `data/projects/` in npm mode and the user-data directory in Electron.
- Image assets have stable IDs and are saved separately from lightweight canvas metadata.
- The prompt library is project-independent.
- API Keys stay server-side; Electron uses `safeStorage` when available.

## Verification

For an ordinary change:

```bash
npm run check
```

For desktop interaction changes, also run:

```bash
npm run smoke:electron
```

The smoke flow covers settings and update UI, prompt reuse, image clipboard actions and regeneration, Banana capability switching, and QuickDraw sketch persistence.

## Windows packaging

```bash
npm run dist:win
npm run smoke:electron:packaged
```

Artifacts are written to `release/`. The current Windows installer is unsigned; never describe it as signed, and retain the SmartScreen/Unknown publisher notice in user-facing update text.

Packaging is not a release. Maintainers must follow [RELEASING.md](RELEASING.md), including CI gates and tag ordering, before publishing a version.
