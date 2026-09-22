export type PendingProjectSave = {
  isPending: () => boolean;
  flush: () => Promise<void>;
  pause: () => Promise<void>;
  resume: () => void;
};

export function createProjectSaveRegistry() {
  type Entry = { saver: PendingProjectSave; detached: boolean; projectId?: string; deleting?: boolean };
  const entries = new Set<Entry>();
  const deletions = new Set<Promise<void>>();
  const flushEntry = async (entry: Entry) => {
    if (entry.deleting) return;
    try { await entry.saver.flush(); } catch (error) {
      if (!entry.deleting) throw error;
    }
    if (entry.detached && !entry.saver.isPending()) entries.delete(entry);
  };
  return {
    hasPending: () => deletions.size > 0 || [...entries].some(({ saver }) => saver.isPending()),
    async flush() {
      do {
        await Promise.all(deletions);
        await Promise.all([...entries].map(flushEntry));
      } while ([...entries].some(({ saver }) => saver.isPending()));
    },
    async deleteProject(projectId: string, remove: () => Promise<void>) {
      const affected = [...entries].filter((entry) => entry.projectId === projectId);
      affected.forEach((entry) => { entry.deleting = true; });
      const deletion = (async () => {
        await Promise.all(affected.map((entry) => entry.saver.pause()));
        try {
          await remove();
          affected.forEach((entry) => entries.delete(entry));
        } catch (error) {
          affected.forEach((entry) => { entry.deleting = false; entry.saver.resume(); });
          throw error;
        }
      })();
      deletions.add(deletion);
      try { await deletion; } finally { deletions.delete(deletion); }
    },
    register(saver: PendingProjectSave, projectId?: string) {
      const entry: Entry = { saver, detached: false, projectId };
      entries.add(entry);
      return () => {
        entry.detached = true;
        // Keep failed or in-flight saves registered after leaving the page.
        void flushEntry(entry).catch((error) => console.error('Failed to flush project:', error));
      };
    },
  };
}

export const projectSaveRegistry = createProjectSaveRegistry();

type ProjectSaveBridge = {
  onFlushProjectSaves: (handler: () => Promise<void>) => () => void;
};

export function installProjectSaveLifecycle() {
  const bridge = (globalThis as typeof globalThis & { bananaDesktop?: ProjectSaveBridge }).bananaDesktop;
  const commitFocusedEditor = () => {
    const editor = document.activeElement;
    if (!(editor instanceof HTMLElement)) return;
    // Commit focused input drafts before checking for pending project changes.
    editor.blur();
  };
  bridge?.onFlushProjectSaves(async () => {
    commitFocusedEditor();
    await projectSaveRegistry.flush();
  });
  window.addEventListener('beforeunload', (event) => {
    commitFocusedEditor();
    if (!projectSaveRegistry.hasPending()) return;
    void projectSaveRegistry.flush().catch((error) => console.error('Failed to save before leaving:', error));
    event.preventDefault();
    event.returnValue = '';
  });
}
