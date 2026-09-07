export type PendingProjectSave = {
  isPending: () => boolean;
  flush: () => Promise<void>;
};

export function createProjectSaveRegistry() {
  const entries = new Set<{ saver: PendingProjectSave; detached: boolean }>();
  const flushEntry = async (entry: { saver: PendingProjectSave; detached: boolean }) => {
    await entry.saver.flush();
    if (entry.detached && !entry.saver.isPending()) entries.delete(entry);
  };
  return {
    hasPending: () => [...entries].some(({ saver }) => saver.isPending()),
    async flush() {
      do {
        await Promise.all([...entries].map(flushEntry));
      } while ([...entries].some(({ saver }) => saver.isPending()));
    },
    register(saver: PendingProjectSave) {
      const entry = { saver, detached: false };
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
