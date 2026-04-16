import { del, get, set } from 'idb-keyval';

import {
  type CanvasNode,
  collectReferencedAssetIdsFromHistory,
  createPersistedSnapshot,
  migrateCanvasNodesToAssetIds,
  pruneAssets,
  type CanvasImageAsset,
  type HistoryCanvasState,
  type PersistedCanvasState,
} from './canvasState';
import { createProjectMeta, type ProjectMeta } from './projects';
import type { Edge } from '@xyflow/react';

export const PROJECT_INDEX_KEY = 'banana-projects-index';
export const PROJECT_KEY_PREFIX = 'banana-project:';
export const LEGACY_CANVAS_STORAGE_KEY = 'banana-art-storage';
export const LEGACY_ASSET_STORAGE_KEY = 'banana-art-assets';

export type ProjectSnapshot = PersistedCanvasState;

export type StorageAdapter = {
  get: (key: string) => Promise<unknown | null>;
  set: (key: string, value: unknown) => Promise<void>;
  del: (key: string) => Promise<void>;
};

export const idbStorageAdapter: StorageAdapter = {
  get: (key) => get(key),
  set: (key, value) => set(key, value),
  del: (key) => del(key),
};

export function getProjectSnapshotKey(projectId: string) {
  return `${PROJECT_KEY_PREFIX}${projectId}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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

function parseStoredValue(value: unknown) {
  if (typeof value !== 'string') {
    return value;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function isHistoryCanvasState(value: unknown): value is HistoryCanvasState {
  return isRecord(value) && Array.isArray(value.nodes) && Array.isArray(value.edges);
}

function sanitizeHistoryCanvasState(state: HistoryCanvasState): HistoryCanvasState {
  return {
    nodes: state.nodes.filter(isCanvasNode),
    edges: state.edges.filter(isCanvasEdge),
  };
}

function isCanvasNode(value: unknown): value is CanvasNode {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    (value.type === undefined || typeof value.type === 'string') &&
    isRecord(value.position) &&
    typeof value.position.x === 'number' &&
    typeof value.position.y === 'number' &&
    isRecord(value.data)
  );
}

function isCanvasEdge(value: unknown): value is Edge {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.source === 'string' &&
    typeof value.target === 'string' &&
    (value.type === undefined || typeof value.type === 'string') &&
    (value.sourceHandle === undefined || typeof value.sourceHandle === 'string' || value.sourceHandle === null) &&
    (value.targetHandle === undefined || typeof value.targetHandle === 'string' || value.targetHandle === null)
  );
}

function extractLegacyHistoryState(value: unknown): HistoryCanvasState | null {
  const parsed = parseStoredValue(value);

  if (isHistoryCanvasState(parsed)) {
    return sanitizeHistoryCanvasState(parsed);
  }

  if (isRecord(parsed) && isHistoryCanvasState(parsed.state)) {
    return sanitizeHistoryCanvasState(parsed.state);
  }

  return null;
}

function isAssetRecord(value: unknown): value is Record<string, CanvasImageAsset> {
  if (!isRecord(value)) {
    return false;
  }

  return Object.values(value).every(
    (asset) =>
      isRecord(asset) &&
      typeof asset.id === 'string' &&
      typeof asset.data === 'string' &&
      typeof asset.mimeType === 'string'
  );
}

function extractAssetRecord(value: unknown): Record<string, CanvasImageAsset> {
  const parsed = parseStoredValue(value);
  return isAssetRecord(parsed) ? parsed : {};
}

function normalizeProjectSnapshot(snapshot: Partial<ProjectSnapshot> | null | undefined): ProjectSnapshot {
  return {
    nodes: Array.isArray(snapshot?.nodes) ? snapshot.nodes.filter(isCanvasNode) : [],
    edges: Array.isArray(snapshot?.edges) ? snapshot.edges.filter(isCanvasEdge) : [],
    assets: isAssetRecord(snapshot?.assets) ? snapshot.assets : {},
  };
}

function sanitizeProjectSnapshot(snapshot: ProjectSnapshot): ProjectSnapshot {
  const referencedAssetIds = collectReferencedAssetIdsFromHistory([{ nodes: snapshot.nodes }]);
  const assets = pruneAssets(snapshot.assets, referencedAssetIds);

  return createPersistedSnapshot({
    nodes: snapshot.nodes,
    edges: snapshot.edges,
    assets,
  });
}

export async function loadProjectIndex(adapter: StorageAdapter): Promise<ProjectMeta[]> {
  const stored = parseStoredValue(await adapter.get(PROJECT_INDEX_KEY));
  return Array.isArray(stored) ? stored.filter(isProjectMeta) : [];
}

export async function saveProjectIndex(adapter: StorageAdapter, projects: ProjectMeta[]) {
  await adapter.set(PROJECT_INDEX_KEY, projects);
}

export async function loadProjectSnapshot(
  adapter: StorageAdapter,
  projectId: string
): Promise<ProjectSnapshot | null> {
  const stored = parseStoredValue(await adapter.get(getProjectSnapshotKey(projectId)));

  if (!isRecord(stored)) {
    return null;
  }

  return normalizeProjectSnapshot(stored as Partial<ProjectSnapshot>);
}

export async function saveProjectSnapshot(
  adapter: StorageAdapter,
  projectId: string,
  snapshot: ProjectSnapshot
) {
  await adapter.set(getProjectSnapshotKey(projectId), sanitizeProjectSnapshot(snapshot));

  const projects = await loadProjectIndex(adapter);
  const now = new Date().toISOString();

  if (projects.some((project) => project.id === projectId)) {
    await saveProjectIndex(
      adapter,
      projects.map((project) =>
        project.id === projectId ? { ...project, updatedAt: now } : project
      )
    );
  }
}

export async function migrateLegacyCanvasIfNeeded(adapter: StorageAdapter): Promise<string | null> {
  const existingProjects = await loadProjectIndex(adapter);
  if (existingProjects.length > 0) {
    return null;
  }

  const legacyState = extractLegacyHistoryState(await adapter.get(LEGACY_CANVAS_STORAGE_KEY));
  if (!legacyState) {
    return null;
  }

  const legacyAssets = extractAssetRecord(await adapter.get(LEGACY_ASSET_STORAGE_KEY));
  const migrated = migrateCanvasNodesToAssetIds(legacyState.nodes, legacyAssets);
  const snapshot = sanitizeProjectSnapshot({
    nodes: migrated.nodes,
    edges: legacyState.edges,
    assets: migrated.assets,
  });

  const project = createProjectMeta('未命名项目');

  await adapter.set(getProjectSnapshotKey(project.id), snapshot);
  await saveProjectIndex(adapter, [project]);

  return project.id;
}

export function createMemoryProjectStorage() {
  const memory = new Map<string, unknown>();

  const adapter: StorageAdapter = {
    async get(key) {
      return memory.has(key) ? structuredClone(memory.get(key)!) : null;
    },
    async set(key, value) {
      memory.set(key, structuredClone(value));
    },
    async del(key) {
      memory.delete(key);
    },
  };

  return {
    adapter,
    async seedIndex(projects: ProjectMeta[]) {
      await adapter.set(PROJECT_INDEX_KEY, projects);
    },
    async seedLegacyCanvas(snapshot: ProjectSnapshot) {
      await adapter.set(
        LEGACY_CANVAS_STORAGE_KEY,
        JSON.stringify({
          state: {
            nodes: snapshot.nodes,
            edges: snapshot.edges,
          },
          version: 0,
        })
      );
      await adapter.set(LEGACY_ASSET_STORAGE_KEY, snapshot.assets);
    },
  };
}
