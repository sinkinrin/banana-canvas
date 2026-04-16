import type { PersistedCanvasState } from './canvasState';

export type ProjectSnapshot = PersistedCanvasState;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function createEmptyProjectSnapshot(): ProjectSnapshot {
  return {
    nodes: [],
    edges: [],
    assets: {},
  };
}

export function normalizeProjectSnapshot(
  snapshot?: Partial<ProjectSnapshot> | null
): ProjectSnapshot {
  return {
    nodes: Array.isArray(snapshot?.nodes) ? snapshot.nodes : [],
    edges: Array.isArray(snapshot?.edges) ? snapshot.edges : [],
    assets: isRecord(snapshot?.assets) ? (snapshot.assets as ProjectSnapshot['assets']) : {},
  };
}
