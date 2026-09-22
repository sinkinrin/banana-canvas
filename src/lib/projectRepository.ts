import { projectSaveRegistry } from './projectSaveLifecycle';
import { collectReferencedAssetIdsFromHistory } from './canvasState';
import { createEmptyProjectSnapshot, type ProjectSnapshot } from './projectSession';
import i18n, { getCurrentLanguage } from '../i18n';
import { createProjectMeta, renameProject, type ProjectMeta } from './projects';
import {
  getProjectSnapshotKey,
  idbStorageAdapter,
  loadProjectIndex,
  loadProjectSnapshot,
  migrateLegacyCanvasIfNeeded,
  saveProjectIndex,
  saveProjectSnapshot,
  type StorageAdapter,
} from './projectStorage';

export type ProjectRepository = {
  listProjects: () => Promise<ProjectMeta[]>;
  createProject: (name: string) => Promise<ProjectMeta>;
  loadProject: (projectId: string) => Promise<{ project: ProjectMeta; snapshot: ProjectSnapshot } | null>;
  saveProjectSnapshot: (projectId: string, snapshot: ProjectSnapshot) => Promise<void>;
  renameProject: (projectId: string, nextName: string) => Promise<ProjectMeta | null>;
  deleteProject: (projectId: string) => Promise<void>;
};

type ProjectRepositoryOptions = {
  fetcher?: typeof fetch;
  storageAdapter?: StorageAdapter;
};

const LOCAL_MIGRATION_KEY = 'banana-local-project-migration-v1';
type MigrationState = { pendingIds: string[] } | { complete: true };
const migrations = new WeakMap<StorageAdapter, Promise<void>>();

type RepositoryMode = 'local' | 'indexeddb';

class LocalApiResponseError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'LocalApiResponseError';
    this.status = status;
  }
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = i18n.t('projects.requestFailed', { status: response.status });
    try {
      const body = await response.json() as { error?: unknown };
      if (
        typeof body.error === 'string' &&
        (response.status < 500 || getCurrentLanguage() === 'zh-CN')
      ) {
        message = body.error;
      }
    } catch {
      // Keep the status-based fallback.
    }
    throw new LocalApiResponseError(response.status, message);
  }

  return await response.json() as T;
}

function shouldFallbackToIndexedDb(error: unknown) {
  if (error instanceof LocalApiResponseError) {
    return error.status === 404;
  }

  return true;
}

type AssetSignatureMap = Map<string, string>;

type ProjectAssetRef = {
  id: string;
  mimeType: string;
  byteLength: number;
  sha256: string;
};

const assetRefCache = new WeakMap<object, Promise<ProjectAssetRef>>();

function createAssetSignature(assetRef: ProjectAssetRef) {
  return `${assetRef.mimeType}:${assetRef.byteLength}:${assetRef.sha256}`;
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function base64ToBytes(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function createAssetRef(asset: ProjectSnapshot['assets'][string]): Promise<ProjectAssetRef> {
  const cached = assetRefCache.get(asset);
  if (cached) return await cached;

  const pending = (async () => {
    const bytes = base64ToBytes(asset.data);
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);

    return {
      id: asset.id,
      mimeType: asset.mimeType,
      byteLength: bytes.byteLength,
      sha256: bytesToHex(new Uint8Array(digest)),
    };
  })();
  assetRefCache.set(asset, pending);
  return await pending;
}

async function createLightweightSnapshot(snapshot: ProjectSnapshot): Promise<ProjectSnapshot & {
  assetRefs: Record<string, ProjectAssetRef>;
}> {
  const assetRefs = Object.fromEntries(
    await Promise.all(
      getReferencedProjectAssets(snapshot).map(async (asset) => [asset.id, await createAssetRef(asset)] as const)
    )
  );

  return {
    nodes: snapshot.nodes,
    edges: snapshot.edges,
    assets: {},
    assetRefs,
  };
}

function getReferencedProjectAssets(snapshot: ProjectSnapshot) {
  const referencedAssetIds = collectReferencedAssetIdsFromHistory([{ nodes: snapshot.nodes }]);
  return [...referencedAssetIds]
    .map((assetId) => snapshot.assets[assetId])
    .filter((asset): asset is ProjectSnapshot['assets'][string] => Boolean(asset));
}

function isMissingProjectAssetError(error: unknown) {
  return (
    error instanceof LocalApiResponseError &&
    error.status === 400 &&
    (
      error.message.includes('Project asset missing') ||
      error.message.includes('Project asset file missing') ||
      error.message.includes('Project asset mismatch')
    )
  );
}

export function createProjectRepository({
  fetcher = fetch,
  storageAdapter = idbStorageAdapter,
}: ProjectRepositoryOptions = {}): ProjectRepository {
  let mode: RepositoryMode | null = null;
  let migrationComplete = false;
  const localAssetSignaturesByProject = new Map<string, AssetSignatureMap>();

  const rememberLocalAssetSignatures = async (
    projectId: string,
    assets: ProjectSnapshot['assets']
  ) => {
    const signatures = localAssetSignaturesByProject.get(projectId) ?? new Map<string, string>();
    // Decode and hash one image at a time to bound temporary memory during loading.
    for (const asset of Object.values(assets)) {
      signatures.set(asset.id, createAssetSignature(await createAssetRef(asset)));
    }
    localAssetSignaturesByProject.set(projectId, signatures);
  };

  const pruneLocalAssetSignatures = (projectId: string, snapshot: ProjectSnapshot) => {
    const signatures = localAssetSignaturesByProject.get(projectId);
    if (!signatures) return;

    const referencedAssetIds = collectReferencedAssetIdsFromHistory([{ nodes: snapshot.nodes }]);
    for (const assetId of signatures.keys()) {
      if (!referencedAssetIds.has(assetId)) {
        signatures.delete(assetId);
      }
    }
  };

  const uploadChangedLocalAssets = async (
    projectId: string,
    snapshot: ProjectSnapshot,
    { force = false }: { force?: boolean } = {}
  ) => {
    const signatures = localAssetSignaturesByProject.get(projectId) ?? new Map<string, string>();

    for (const asset of getReferencedProjectAssets(snapshot)) {
      const signature = createAssetSignature(await createAssetRef(asset));
      if (!force && signatures.get(asset.id) === signature) continue;

      await readJson<{ ok: true }>(
        await fetcher(`/api/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(asset.id)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ asset }),
        })
      );
      signatures.set(asset.id, signature);
    }

    localAssetSignaturesByProject.set(projectId, signatures);
  };

  const saveLightweightLocalSnapshot = async (projectId: string, snapshot: ProjectSnapshot) => {
    await readJson<{ ok: true }>(
      await fetcher(`/api/projects/${encodeURIComponent(projectId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(await createLightweightSnapshot(snapshot)),
      })
    );
    pruneLocalAssetSignatures(projectId, snapshot);
  };

  const fetchLocalProjects = async () => {
    const body = await readJson<{ projects: ProjectMeta[]; storageInitialized?: boolean }>(await fetcher('/api/projects'));
    return { ...body, projects: Array.isArray(body.projects) ? body.projects : [] };
  };

  const migrateIndexedDbToLocal = async (local: Awaited<ReturnType<typeof fetchLocalProjects>>) => {
    if (migrationComplete) return;
    const existingMigration = migrations.get(storageAdapter);
    if (existingMigration) {
      await existingMigration;
      migrationComplete = true;
      return;
    }
    const migration = (async () => {
      const state = await Promise.resolve().then(() => storageAdapter.get(LOCAL_MIGRATION_KEY)).catch((error) => {
        if (local.storageInitialized || local.projects.length > 0) return null;
        throw error;
      }) as MigrationState | null;
      if (state && 'complete' in state) return;
      if (!state && (local.storageInitialized || local.projects.length > 0)) return;

      await migrateLegacyCanvasIfNeeded(storageAdapter);
      const projects = await loadProjectIndex(storageAdapter);
      let pendingIds = state && 'pendingIds' in state ? state.pendingIds : projects.map((project) => project.id);
      // Keep a durable journal before creating any local records. Failed uploads
      // can then resume even though the local project list is no longer empty.
      await storageAdapter.set(LOCAL_MIGRATION_KEY, { pendingIds });
      const localIds = new Set(local.projects.map((project) => project.id));
      for (const id of [...pendingIds]) {
        const project = projects.find((item) => item.id === id);
        const snapshot = await loadProjectSnapshot(storageAdapter, id);
        if (!project || !snapshot) throw new Error(i18n.t('projects.migrationSourceMissing'));
        if (!localIds.has(id)) {
          await readJson(await fetcher('/api/projects/import', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ projects: [{ project, snapshot: createEmptyProjectSnapshot() }] }),
          }));
        }
        await uploadChangedLocalAssets(id, snapshot, { force: true });
        await saveLightweightLocalSnapshot(id, snapshot);
        pendingIds = pendingIds.filter((pendingId) => pendingId !== id);
        await storageAdapter.set(LOCAL_MIGRATION_KEY, { pendingIds });
      }
      await storageAdapter.set(LOCAL_MIGRATION_KEY, { complete: true });
    })();
    migrations.set(storageAdapter, migration);
    try {
      await migration;
      migrationComplete = true;
    } finally {
      migrations.delete(storageAdapter);
    }
  };

  const getLocalProjectsOrNull = async () => {
    if (mode === 'indexeddb') return null;
    let local: Awaited<ReturnType<typeof fetchLocalProjects>>;
    try {
      local = await fetchLocalProjects();
    } catch (error) {
      if (!shouldFallbackToIndexedDb(error)) throw error;
      mode = 'indexeddb';
      return null;
    }
    // Migration failures must remain visible and retryable, never switch storage.
    const wasComplete = migrationComplete;
    await migrateIndexedDbToLocal(local);
    mode = 'local';
    return wasComplete ? local.projects : (await fetchLocalProjects()).projects;
  };

  const useLocal = async () => {
    if (mode === 'local') return true;
    return (await getLocalProjectsOrNull()) !== null;
  };

  return {
    async listProjects() {
      const localProjects = await getLocalProjectsOrNull();
      if (localProjects) return localProjects;
      await migrateLegacyCanvasIfNeeded(storageAdapter);
      return await loadProjectIndex(storageAdapter);
    },

    async createProject(name) {
      if (await useLocal()) {
        const body = await readJson<{ project: ProjectMeta }>(
          await fetcher('/api/projects', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, snapshot: createEmptyProjectSnapshot() }),
          })
        );
        return body.project;
      }

      const project = createProjectMeta(name);
      const projects = await loadProjectIndex(storageAdapter);
      await saveProjectIndex(storageAdapter, [project, ...projects]);
      await saveProjectSnapshot(storageAdapter, project.id, createEmptyProjectSnapshot());
      return project;
    },

    async loadProject(projectId) {
      if (await useLocal()) {
        const projectUrl = `/api/projects/${encodeURIComponent(projectId)}`;
        const response = await fetcher(`${projectUrl}?assets=separate`);
        if (response.status === 404) return null;
        const loaded = await readJson<{
          project: ProjectMeta;
          snapshot: ProjectSnapshot;
          assetIds?: string[];
        }>(response);
        // Older servers may still return inline assets. New servers send a small
        // manifest so the project never has to fit into a single JSON string.
        await rememberLocalAssetSignatures(projectId, loaded.snapshot.assets);
        for (const assetId of loaded.assetIds ?? []) {
          const assetResponse = await fetcher(`${projectUrl}/assets/${encodeURIComponent(assetId)}`);
          // Preserve the existing behavior for an image file missing on disk.
          if (assetResponse.status === 404) continue;
          const { asset } = await readJson<{ asset: ProjectSnapshot['assets'][string] }>(assetResponse);
          loaded.snapshot.assets[assetId] = asset;
          await rememberLocalAssetSignatures(projectId, { [assetId]: asset });
        }
        return loaded;
      }

      const projects = await loadProjectIndex(storageAdapter);
      const project = projects.find((item) => item.id === projectId);
      if (!project) return null;
      return {
        project,
        snapshot: await loadProjectSnapshot(storageAdapter, projectId) ?? createEmptyProjectSnapshot(),
      };
    },

    async saveProjectSnapshot(projectId, snapshot) {
      if (await useLocal()) {
        await uploadChangedLocalAssets(projectId, snapshot);
        try {
          await saveLightweightLocalSnapshot(projectId, snapshot);
        } catch (error) {
          if (!isMissingProjectAssetError(error)) throw error;
          await uploadChangedLocalAssets(projectId, snapshot, { force: true });
          await saveLightweightLocalSnapshot(projectId, snapshot);
        }
        return;
      }

      await saveProjectSnapshot(storageAdapter, projectId, snapshot);
    },

    async renameProject(projectId, nextName) {
      if (await useLocal()) {
        const response = await fetcher(`/api/projects/${encodeURIComponent(projectId)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: nextName }),
        });
        if (response.status === 404) return null;
        const body = await readJson<{ project: ProjectMeta }>(response);
        return body.project;
      }

      const projects = await loadProjectIndex(storageAdapter);
      const existing = projects.find((item) => item.id === projectId);
      if (!existing) return null;
      const renamed = renameProject(existing, nextName);
      await saveProjectIndex(
        storageAdapter,
        projects.map((project) => project.id === projectId ? renamed : project)
      );
      return renamed;
    },

    async deleteProject(projectId) {
      await projectSaveRegistry.deleteProject(projectId, async () => {
        if (await useLocal()) {
          await readJson<{ ok: true }>(
            await fetcher(`/api/projects/${encodeURIComponent(projectId)}`, {
              method: 'DELETE',
            })
          );
          return;
        }

        await storageAdapter.del(getProjectSnapshotKey(projectId));
        await saveProjectIndex(
          storageAdapter,
          (await loadProjectIndex(storageAdapter)).filter((project) => project.id !== projectId)
        );
      });
    },
  };
}
