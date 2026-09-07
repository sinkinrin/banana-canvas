import { areHistoryStatesEqual } from './canvasState';
import type { ProjectSnapshot } from './projectSession';

export type ProjectSaveStatus = 'saving' | 'saved' | 'error';

export function hasProjectSnapshotChanged(previous: ProjectSnapshot, current: ProjectSnapshot) {
  if (!areHistoryStatesEqual(
    { nodes: previous.nodes, edges: previous.edges },
    { nodes: current.nodes, edges: current.edges },
  )) return true;
  const ids = Object.keys(previous.assets);
  if (ids.length !== Object.keys(current.assets).length) return true;
  return ids.some((id) => {
    const before = previous.assets[id];
    const after = current.assets[id];
    return !after || before.id !== after.id || before.mimeType !== after.mimeType || before.data !== after.data;
  });
}

export function createProjectAutosave({
  initialSnapshot,
  save,
  onStatusChange,
  delayMs = 500,
}: {
  initialSnapshot: ProjectSnapshot;
  save: (snapshot: ProjectSnapshot) => Promise<void>;
  onStatusChange: (status: ProjectSaveStatus) => void;
  delayMs?: number;
}) {
  let saved = initialSnapshot;
  let latest = initialSnapshot;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inFlight: Promise<void> | undefined;
  const isPending = () => Boolean(inFlight) || hasProjectSnapshotChanged(saved, latest);

  const flush = (): Promise<void> => {
    clearTimeout(timer);
    timer = undefined;
    if (inFlight) return inFlight;
    if (!hasProjectSnapshotChanged(saved, latest)) return Promise.resolve();
    onStatusChange('saving');
    inFlight = (async () => {
      try {
        while (hasProjectSnapshotChanged(saved, latest)) {
          const snapshot = latest;
          await save(snapshot);
          saved = snapshot;
        }
        onStatusChange('saved');
      } catch (error) {
        onStatusChange('error');
        throw error;
      } finally {
        inFlight = undefined;
      }
    })();
    return inFlight;
  };

  return {
    isPending,
    flush,
    update(snapshot: ProjectSnapshot) {
      if (!hasProjectSnapshotChanged(latest, snapshot)) return;
      latest = snapshot;
      clearTimeout(timer);
      onStatusChange(isPending() ? 'saving' : 'saved');
      if (!isPending()) return;
      timer = setTimeout(() => {
        void flush().catch((error) => console.error('Failed to save project:', error));
      }, delayMs);
    },
  };
}
