import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, extname, join, resolve, sep } from 'node:path';

import {
  collectReferencedAssetIdsFromHistory,
  pruneAssets,
  type CanvasImageAsset,
} from './canvasState';
import { createProjectMeta, renameProject, type ProjectMeta } from './projects';
import { createEmptyProjectSnapshot, type ProjectSnapshot } from './projectSession';

type StoredAsset = {
  id: string;
  mimeType: string;
  fileName: string;
};

type StoredProjectSnapshot = {
  nodes: ProjectSnapshot['nodes'];
  edges: ProjectSnapshot['edges'];
  assets: Record<string, StoredAsset>;
};

type ProjectImportEntry = {
  project: ProjectMeta;
  snapshot: ProjectSnapshot;
};

export type LocalProjectStore = {
  loadProjectIndex: () => Promise<ProjectMeta[]>;
  saveProjectIndex: (projects: ProjectMeta[]) => Promise<void>;
  createProject: (name: string, snapshot?: ProjectSnapshot) => Promise<ProjectMeta>;
  importProject: (project: ProjectMeta, snapshot: ProjectSnapshot) => Promise<void>;
  importProjects: (entries: ProjectImportEntry[]) => Promise<void>;
  loadProject: (projectId: string) => Promise<{ project: ProjectMeta; snapshot: ProjectSnapshot } | null>;
  saveProjectSnapshot: (projectId: string, snapshot: ProjectSnapshot) => Promise<void>;
  renameProject: (projectId: string, nextName: string) => Promise<ProjectMeta | null>;
  deleteProject: (projectId: string) => Promise<void>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateProjectId(projectId: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(projectId)) {
    throw new Error('Invalid project id');
  }
}

function validateAssetId(assetId: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(assetId)) {
    throw new Error('Invalid asset id');
  }
}

function ensureInside(parent: string, child: string) {
  const resolvedParent = resolve(parent);
  const resolvedChild = resolve(child);
  if (resolvedChild !== resolvedParent && !resolvedChild.startsWith(`${resolvedParent}${sep}`)) {
    throw new Error('Resolved path escapes storage root');
  }
}

function assetExtension(mimeType: string) {
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'image/gif') return 'gif';
  const subtype = mimeType.match(/^image\/([a-z0-9.+-]+)$/i)?.[1];
  return subtype ? subtype.replace(/[^A-Za-z0-9_-]/g, '') || 'img' : 'img';
}

function mimeTypeFromFileName(fileName: string) {
  const ext = extname(fileName).slice(1).toLowerCase();
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  return 'image/png';
}

async function readJsonFile<T>(path: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T;
  } catch (error: any) {
    if (error?.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function writeJsonFile(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true });
  const tempPath = `${path}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
  try {
    await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    await rename(tempPath, path);
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

async function writeBinaryFile(path: string, value: Buffer) {
  await mkdir(dirname(path), { recursive: true });
  const tempPath = `${path}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
  try {
    await writeFile(tempPath, value);
    await rename(tempPath, path);
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

function isProjectMeta(value: unknown): value is ProjectMeta {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.createdAt === 'string' &&
    typeof value.updatedAt === 'string'
  );
}

function normalizeIndex(value: unknown): ProjectMeta[] {
  return Array.isArray(value) ? value.filter(isProjectMeta) : [];
}

function normalizeStoredSnapshot(value: unknown): StoredProjectSnapshot {
  if (!isRecord(value)) {
    return { nodes: [], edges: [], assets: {} };
  }

  const assets: Record<string, StoredAsset> = {};
  if (isRecord(value.assets)) {
    for (const [id, asset] of Object.entries(value.assets)) {
      if (
        isRecord(asset) &&
        typeof asset.id === 'string' &&
        typeof asset.mimeType === 'string' &&
        typeof asset.fileName === 'string'
      ) {
        assets[id] = {
          id: asset.id,
          mimeType: asset.mimeType,
          fileName: asset.fileName,
        };
      }
    }
  }

  return {
    nodes: Array.isArray(value.nodes) ? value.nodes as ProjectSnapshot['nodes'] : [],
    edges: Array.isArray(value.edges) ? value.edges as ProjectSnapshot['edges'] : [],
    assets,
  };
}

export function createLocalProjectStore(rootDir: string): LocalProjectStore {
  const storageRoot = resolve(rootDir);
  const projectsDir = join(storageRoot, 'projects');
  const indexPath = join(projectsDir, 'index.json');
  let writeQueue: Promise<void> = Promise.resolve();

  const projectDir = (projectId: string) => {
    validateProjectId(projectId);
    const path = join(projectsDir, projectId);
    ensureInside(projectsDir, path);
    return path;
  };

  const projectJsonPath = (projectId: string) => join(projectDir(projectId), 'project.json');
  const assetsDir = (projectId: string) => join(projectDir(projectId), 'assets');

  const runWriteTask = async <T>(task: () => Promise<T>): Promise<T> => {
    const current = writeQueue.catch(() => undefined).then(task);
    writeQueue = current.catch(() => undefined).then(() => undefined);
    return await current;
  };

  const writeProjectSnapshotFiles = async (projectId: string, snapshot: ProjectSnapshot) => {
    const dir = projectDir(projectId);
    const assetDir = assetsDir(projectId);
    await mkdir(assetDir, { recursive: true });

    const referencedAssets = pruneAssets(
      snapshot.assets,
      collectReferencedAssetIdsFromHistory([{ nodes: snapshot.nodes }])
    );
    const storedAssets: Record<string, StoredAsset> = {};

    for (const [assetId, asset] of Object.entries(referencedAssets)) {
      validateAssetId(assetId);
      const fileName = `${assetId}.${assetExtension(asset.mimeType)}`;
      const filePath = join(assetDir, fileName);
      ensureInside(assetDir, filePath);
      await writeBinaryFile(filePath, Buffer.from(asset.data, 'base64'));
      storedAssets[assetId] = {
        id: asset.id,
        mimeType: asset.mimeType,
        fileName,
      };
    }

    await writeJsonFile(join(dir, 'project.json'), {
      nodes: snapshot.nodes,
      edges: snapshot.edges,
      assets: storedAssets,
    });

    try {
      const existingFiles = await readdir(assetDir);
      await Promise.all(
        existingFiles
          .filter((fileName) => !Object.values(storedAssets).some((asset) => asset.fileName === fileName))
          .map((fileName) => {
            const filePath = join(assetDir, fileName);
            ensureInside(assetDir, filePath);
            return rm(filePath, { force: true });
          })
      );
    } catch (error: any) {
      if (error?.code !== 'ENOENT') throw error;
    }
  };

  const store: LocalProjectStore = {
    async loadProjectIndex() {
      const value = await readJsonFile<unknown>(indexPath, []);
      return normalizeIndex(value);
    },

    async saveProjectIndex(projects) {
      await runWriteTask(() => writeJsonFile(indexPath, projects));
    },

    async createProject(name, snapshot = createEmptyProjectSnapshot()) {
      return await runWriteTask(async () => {
        const project = createProjectMeta(name);
        const projects = await store.loadProjectIndex();
        await writeProjectSnapshotFiles(project.id, snapshot);
        await writeJsonFile(indexPath, [project, ...projects]);
        return project;
      });
    },

    async importProject(project, snapshot) {
      await store.importProjects([{ project, snapshot }]);
    },

    async importProjects(entries) {
      await runWriteTask(async () => {
        const normalizedEntries = Array.from(
          entries.reduce((map, entry) => {
            validateProjectId(entry.project.id);
            map.set(entry.project.id, entry);
            return map;
          }, new Map<string, ProjectImportEntry>()).values()
        );
        const projects = await store.loadProjectIndex();

        for (const entry of normalizedEntries) {
          await writeProjectSnapshotFiles(entry.project.id, entry.snapshot);
        }

        const importedIds = new Set(normalizedEntries.map((entry) => entry.project.id));
        await writeJsonFile(indexPath, [
          ...normalizedEntries.map((entry) => entry.project),
          ...projects.filter((item) => !importedIds.has(item.id)),
        ]);
      });
    },

    async loadProject(projectId) {
      validateProjectId(projectId);
      const projects = await store.loadProjectIndex();
      const project = projects.find((item) => item.id === projectId);
      if (!project) return null;

      const stored = normalizeStoredSnapshot(
        await readJsonFile<unknown>(projectJsonPath(projectId), { nodes: [], edges: [], assets: {} })
      );
      const assets: Record<string, CanvasImageAsset> = {};

      for (const [assetId, asset] of Object.entries(stored.assets)) {
        validateAssetId(assetId);
        const filePath = join(assetsDir(projectId), asset.fileName);
        ensureInside(assetsDir(projectId), filePath);
        try {
          assets[assetId] = {
            id: asset.id,
            mimeType: asset.mimeType || mimeTypeFromFileName(asset.fileName),
            data: (await readFile(filePath)).toString('base64'),
          };
        } catch (error: any) {
          if (error?.code !== 'ENOENT') throw error;
        }
      }

      return {
        project,
        snapshot: {
          nodes: stored.nodes,
          edges: stored.edges,
          assets,
        },
      };
    },

    async saveProjectSnapshot(projectId, snapshot) {
      await runWriteTask(async () => {
        validateProjectId(projectId);
        const projects = await store.loadProjectIndex();
        if (!projects.some((project) => project.id === projectId)) {
          throw new Error('Project not found');
        }

        await writeProjectSnapshotFiles(projectId, snapshot);

        const now = new Date().toISOString();
        await writeJsonFile(
          indexPath,
          projects.map((project) => project.id === projectId ? { ...project, updatedAt: now } : project)
        );
      });
    },

    async renameProject(projectId, nextName) {
      return await runWriteTask(async () => {
        validateProjectId(projectId);
        const projects = await store.loadProjectIndex();
        const existing = projects.find((project) => project.id === projectId);
        if (!existing) return null;

        const renamed = renameProject(existing, nextName);
        await writeJsonFile(
          indexPath,
          projects.map((project) => project.id === projectId ? renamed : project)
        );
        return renamed;
      });
    },

    async deleteProject(projectId) {
      await runWriteTask(async () => {
        const dir = projectDir(projectId);
        ensureInside(projectsDir, dir);
        await rm(dir, { recursive: true, force: true });
        await writeJsonFile(
          indexPath,
          (await store.loadProjectIndex()).filter((project) => project.id !== projectId)
        );
      });
    },
  };

  return store;
}
