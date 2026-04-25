# Local File Storage Design

## Goal

Move project persistence from browser-only IndexedDB to a local server-managed file store, while preserving existing project data and keeping the app usable as a local desktop-style web tool.

## Confirmed Scope

- Add a server-side local project store under `BANANA_DATA_DIR`, defaulting to `./data`.
- Store project metadata in `projects/index.json`.
- Store each project snapshot in `projects/<projectId>/project.json`.
- Store image assets as files in `projects/<projectId>/assets/<assetId>.<ext>`.
- Expose HTTP APIs for listing, creating, reading, saving, renaming, and deleting projects.
- On first use, migrate existing IndexedDB projects into the local file store.
- Keep IndexedDB code as a fallback for migration and environments where local APIs are unavailable.
- Make mask-edit comparison source images durable by saving source and result assets through the same asset store.

## Non-Goals

- Do not add SQLite for this version.
- Do not add cloud sync or multi-user auth.
- Do not add cross-device sync.
- Do not persist temporary mask brush drafts.
- Do not build an asset library UI separate from project assets.

## Technology Choice

Use Node's built-in filesystem APIs with JSON manifests and binary asset files.

Rationale:

- The data model is a small project index plus per-project canvas snapshots and images.
- File storage has no native dependency risk on Windows.
- JSON snapshots are easy to inspect, back up, and repair manually.
- Asset files avoid storing large base64 blobs in browser storage long-term.
- SQLite is out of scope for this version; the file layout leaves a future migration path open.

## Directory Layout

```text
data/
  projects/
    index.json
    <projectId>/
      project.json
      assets/
        <assetId>.png
        <assetId>.jpg
        <assetId>.webp
```

`BANANA_DATA_DIR` may override `data/`. Relative paths resolve from the project root.

## Server API

All endpoints return JSON.

- `GET /api/projects` returns `{ projects }`.
- `POST /api/projects` accepts `{ name, snapshot? }` and returns `{ project }`.
- `GET /api/projects/:projectId` returns `{ project, snapshot }`.
- `PUT /api/projects/:projectId` accepts a full project snapshot and returns `{ ok: true }`.
- `PATCH /api/projects/:projectId` accepts `{ name }` and returns `{ project }`.
- `DELETE /api/projects/:projectId` deletes the project directory and updates the index.

Snapshots sent over the API still use the existing `ProjectSnapshot` shape:

```ts
{
  nodes: CanvasNode[];
  edges: Edge[];
  assets: Record<string, CanvasImageAsset>;
}
```

The server converts `assets` to files when saving and reconstructs `assets` as base64 records when loading. This keeps the frontend migration small and compatible with existing canvas normalization.

## Write Safety

- JSON writes use a temporary file followed by `rename`.
- Asset writes use deterministic filenames derived from asset id and MIME type.
- Project ids are validated to prevent path traversal.
- Deleting a project resolves and checks the final path before recursive deletion.

## Migration Flow

1. ProjectsPage loads.
2. Frontend calls `GET /api/projects`.
3. If local projects exist, it uses local file storage.
4. If local projects are empty, it reads existing IndexedDB projects.
5. If IndexedDB has projects, it sends each snapshot to local file storage.
6. After successful migration, the UI uses local file storage as primary.

IndexedDB data is not deleted automatically in this version. Keeping it gives a rollback path.

## Frontend Changes

- Add a `ProjectRepository` abstraction with the same operations used by project pages.
- Implement `localProjectRepository` using `/api/projects`.
- Keep existing IndexedDB helpers for migration and fallback.
- Update ProjectsPage and ProjectCanvasPage to use the repository rather than calling `idbStorageAdapter` directly.
- Preserve the existing autosave debounce behavior.

## Error Handling

- If local API is unavailable, the app falls back to IndexedDB and displays the existing local-only behavior.
- If migration fails, local file storage is not marked as primary for that session.
- If save fails, the header shows `保存失败` as it does today.
- Server errors include short Chinese messages suitable for UI display.

## Testing Strategy

- Unit test the file store writes index and project snapshots.
- Unit test assets are written as files and restored as base64 assets.
- Unit test path validation rejects traversal ids.
- Unit test frontend repository falls back when local API calls fail.
- Existing projectStorage tests continue covering IndexedDB behavior.
- Browser smoke test creates, reloads, renames, and reopens a local project.
