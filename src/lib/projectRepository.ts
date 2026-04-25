import { createEmptyProjectSnapshot, type ProjectSnapshot } from './projectSession';
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
    let message = `请求失败 (${response.status})`;
    try {
      const body = await response.json() as { error?: unknown };
      if (typeof body.error === 'string') message = body.error;
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

export function createProjectRepository({
  fetcher = fetch,
  storageAdapter = idbStorageAdapter,
}: ProjectRepositoryOptions = {}): ProjectRepository {
  let mode: RepositoryMode | null = null;
  let migrationAttempted = false;

  const fetchLocalProjects = async () => {
    const body = await readJson<{ projects: ProjectMeta[] }>(await fetcher('/api/projects'));
    return Array.isArray(body.projects) ? body.projects : [];
  };

  const migrateIndexedDbToLocal = async () => {
    if (migrationAttempted) return;
    migrationAttempted = true;

    await migrateLegacyCanvasIfNeeded(storageAdapter);
    const projects = await loadProjectIndex(storageAdapter);
    if (projects.length === 0) return;

    const entries = [];
    for (const project of projects) {
      entries.push({
        project,
        snapshot: await loadProjectSnapshot(storageAdapter, project.id) ?? createEmptyProjectSnapshot(),
      });
    }

    await readJson<{ ok: true }>(
      await fetcher('/api/projects/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projects: entries }),
      })
    );
  };

  const getLocalProjectsOrNull = async () => {
    if (mode === 'indexeddb') return null;

    try {
      const projects = await fetchLocalProjects();
      mode = 'local';
      if (projects.length === 0) {
        await migrateIndexedDbToLocal();
        return await fetchLocalProjects();
      }
      return projects;
    } catch (error) {
      if (!shouldFallbackToIndexedDb(error)) {
        throw error;
      }
      mode = 'indexeddb';
      return null;
    }
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
        const response = await fetcher(`/api/projects/${encodeURIComponent(projectId)}`);
        if (response.status === 404) return null;
        return await readJson<{ project: ProjectMeta; snapshot: ProjectSnapshot }>(response);
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
        await readJson<{ ok: true }>(
          await fetcher(`/api/projects/${encodeURIComponent(projectId)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(snapshot),
          })
        );
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
    },
  };
}
