# Comprehensive Maintenance Design

## Context

Banana Canvas is a Vite, React, TypeScript, and Express application for infinite-canvas AI image generation. The current feature set is healthy and covered by tests, but several areas have grown harder to change safely:

- `server.ts` mixes server startup, API routing, provider calls, proxy setup, retry behavior, and response parsing.
- `PromptNode.tsx` and `ImageNode.tsx` combine UI rendering with generation, reference image, mask edit, copy, download, and rerun workflows.
- Project create, rename, and delete actions use native `window.prompt` and `window.confirm`.
- API request validation is spread across ad hoc normalization logic.
- `package.json` still uses the placeholder package name `react-example`, and test commands are documented but not available as npm scripts.

The goal is to improve maintainability and user experience without changing the core product behavior.

## Scope

This work includes:

- Rename the package to `banana-canvas`.
- Add npm scripts for repeatable test and full verification commands.
- Split server modules while preserving the public API contract.
- Add explicit request validation before generation provider calls.
- Replace native project prompts and confirms with app-owned dialogs.
- Extract reusable node workflow logic from large node components.
- Update README references affected by the new scripts and structure.
- Preserve current project storage, generation, mask edit, and canvas behavior.

This work does not include:

- Adding new image providers.
- Redesigning the visual language.
- Changing persisted project snapshot shape unless needed for compatibility-preserving extraction.
- Changing AI model defaults or provider-specific parameter behavior.

## Server Architecture

`server.ts` will become a thin bootstrap file. It will load environment variables, configure global proxy behavior, create the Express app, mount API routes, attach Vite middleware in development or static assets in production, and listen on the configured port.

Server behavior will move into focused modules:

- `src/server/projectsRoutes.ts`: mounts `/api/projects` CRUD and import routes around `createLocalProjectStore`.
- `src/server/generationRoutes.ts`: mounts `/api/generate-image` and `/api/optimize-prompt`, owns request IDs and HTTP response shaping.
- `src/server/providers/banana.ts`: builds and sends Gemini/Banana requests and extracts generated image URLs.
- `src/server/providers/image2.ts`: builds and sends Image2 requests, including endpoint selection, retries, streaming, masks, proxy/direct attempts, and generated URL normalization.
- `src/server/proxy.ts`: owns proxy URL resolution, redaction, undici agent creation, and optional global fetch wrapping.
- `src/server/requestValidation.ts`: validates incoming generation payloads before provider dispatch.

Existing model parameter builders and normalizers remain in `src/lib/imageModels.ts` unless a later implementation step exposes a clear need to split that file too. Keeping them in place limits behavior drift during the server refactor.

## API Validation

Generation request validation will run before dispatching to Banana or Image2. It will reject malformed requests with `400` responses and clear error messages. Provider failures will continue to return `500` with a request ID.

The current API behavior gives `referenceImages` precedence over `referenceImage`: when `referenceImages` exists, `referenceImage` is ignored rather than appended. This maintenance pass will preserve that edge-case behavior. Validation should operate on the effective reference input path only, and the effective reference list is capped at four images.

Validation rules:

- `prompt`, when present, must be a string.
- `imageModel` is normalized with existing model rules.
- `referenceImage` and `referenceImages` are accepted, preserving current precedence where `referenceImages` wins when present.
- The effective reference image list must contain at most four images.
- Each reference image must have `data` and `mimeType` strings.
- Image MIME types must start with `image/`.
- Base64 data must be non-empty and decodable.
- `maskImage` is only accepted for Image2 requests.
- `maskImage` must be a PNG payload.
- Banana and Image2 option objects continue to be normalized with existing helpers.

The first pass will use local validator functions rather than adding a schema library. This keeps dependencies stable and fits the current code style. If the validator becomes difficult to read or reuse during implementation, adding a small schema dependency can be reconsidered as a separate decision.

## Frontend Dialogs

Project create, rename, and delete flows will use app-owned dialogs instead of native browser dialogs.

Components:

- `ProjectNameDialog`: shared by create and rename. It receives title, initial value, confirm label, cancel label, and callbacks. Empty or whitespace-only values are allowed and continue to resolve to the existing default project name.
- `ConfirmDialog`: used for project deletion. It receives title, body text, destructive confirm label, cancel label, and callbacks.

The dialogs will follow the existing dark UI style, use restrained borders and lucide icons, and keep behavior simple:

- Create opens with `未命名项目`.
- Rename opens with the current project name.
- Delete requires explicit confirmation.
- Escape or cancel closes without changing data.
- Submitting the name dialog calls the existing repository actions.

No external UI framework will be added.

## Node Workflow Extraction

Large node components will be simplified without changing their rendered controls or behavior.

Planned hooks:

- `useReferenceImages`: resolves asset-backed references, handles upload and paste reads, enforces the four-image limit, and exposes add/remove helpers plus hydration state.
- `usePromptGeneration`: owns prompt generation from `PromptNode`, including placeholder image nodes, generated edges, batch count, abort handling, progress count, provider options, and error state updates.
- `useImageNodeActions`: owns `ImageNode` actions for download, copy image, copy prompt, rerun, and create reference node.
- `useMaskGeneration`: shares mask edit generation behavior between prompt reference images and image nodes.

The extraction must keep store mutations compatible with existing tests and persisted snapshots. Hooks should expose small event handlers and state flags; components should remain responsible for layout and visual rendering.

## Scripts And Install Behavior

`package.json` will be updated:

- `name`: `banana-canvas`
- `test`: `tsx --test "src/**/*.test.ts" "src/**/*.test.tsx"`
- `check`: `npm run lint && npm test && npm run build`

`package-lock.json` will also be updated so the package rename is reflected consistently in dependency metadata.

`npm install` will remain a setup step, not part of `check`. Install commands mutate `node_modules` and can modify dependency metadata; verification commands should be repeatable and avoid changing the working tree. Fresh environments should run `npm ci` when a lockfile is present, or `npm install` for local setup, before running `npm run check`.

README will document `npm test` and `npm run check`, while keeping the existing initial dependency installation instructions.

## Testing Strategy

Implementation will follow test-driven development.

The existing test suite uses `node:test` plus server tests and static React markup assertions. This pass will not add jsdom, happy-dom, Testing Library, or another browser-like DOM dependency. Dialog and hook behavior should be tested through extracted pure logic and callback helpers where possible, with rendered structure covered through `renderToStaticMarkup`.

Targeted tests:

- `requestValidation` unit tests for invalid prompt types, too many reference images, malformed image payloads, invalid mask usage, and valid normalized payloads.
- Route-level tests where practical for `400` vs `500` response behavior without calling real providers.
- Pure logic tests for dialog state helpers and extracted callbacks covering create, rename, delete, cancel, Escape, and empty-name submission behavior.
- `renderToStaticMarkup` tests for rendered dialog markup, labels, destructive state, and accessible button/form structure.
- Pure logic tests for reference image limits, prompt generation placeholder creation, rerun reference resolution, and shared mask generation behavior.
- Existing image model, project storage, project repository, canvas state, and node tests must keep passing.

Final verification:

```bash
npm run check
```

If `npm run build` reveals production-only issues that were not covered by TypeScript checking, those issues are in scope for this maintenance pass.

## Migration And Compatibility

No project data migration is planned. Local project files under `data/projects/`, IndexedDB fallback data, node snapshot fields, asset IDs, mask edit metadata, and model parameter fields should remain compatible.

Existing API endpoints and response shapes should remain stable:

- `GET /api/projects`
- `POST /api/projects`
- `POST /api/projects/import`
- `GET /api/projects/:projectId`
- `PUT /api/projects/:projectId`
- `PATCH /api/projects/:projectId`
- `DELETE /api/projects/:projectId`
- `POST /api/generate-image`
- `POST /api/optimize-prompt`

The only intentional API behavior change is earlier rejection of malformed generation requests with `400`.

## Risks

- Server extraction could accidentally change provider retry or proxy behavior. Mitigation: move code in small slices and keep provider-focused tests around request building, URL extraction, retry classification, and endpoint selection passing throughout.
- Hook extraction could alter store update timing. Mitigation: preserve existing public component behavior and test the store effects rather than implementation details.
- Dialog replacement could miss native keyboard behavior. Mitigation: test cancel, submit, and Escape behavior explicitly.
- `npm run check` includes build, so it may expose existing build warnings or failures. Mitigation: treat build failures as part of this maintenance scope.
