import { Suspense, lazy, useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, Pencil, Save, Settings } from 'lucide-react';
import { useAppTranslation } from '../i18n';

import { MissingProjectState } from '../components/projects/MissingProjectState';
import { ProjectNameDialog } from '../components/projects/ProjectNameDialog';
import { areHistoryStatesEqual } from '../lib/canvasState';
import { createEmptyProjectSnapshot, type ProjectSnapshot } from '../lib/projectSession';
import type { ProjectMeta } from '../lib/projects';
import { createProjectRepository } from '../lib/projectRepository';
import { useStore } from '../store';

type ProjectLoadStatus = 'loading' | 'ready' | 'missing' | 'error';
type SaveStatus = 'loading' | 'saving' | 'saved' | 'error';

const projectRepository = createProjectRepository();

const Canvas = lazy(async () => {
  const module = await import('../components/Canvas');
  return { default: module.Canvas };
});

export type ProjectCanvasPageViewProps = {
  project: ProjectMeta;
  saveStatus: SaveStatus;
  onBack: () => void;
  onRename: () => void;
  onOpenSettings?: () => void;
  children?: ReactNode;
};

function navigateToProjects() {
  window.history.pushState({}, '', '/');
  window.dispatchEvent(new PopStateEvent('popstate'));
}

function saveStatusKey(saveStatus: SaveStatus) {
  if (saveStatus === 'loading') return 'projects.saveStatus.loading' as const;
  if (saveStatus === 'saving') return 'projects.saveStatus.saving' as const;
  if (saveStatus === 'error') return 'projects.saveStatus.error' as const;
  return 'projects.saveStatus.saved' as const;
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function hasProjectSnapshotChanged(previous: ProjectSnapshot | null, current: ProjectSnapshot) {
  if (!previous) return true;
  if (
    !areHistoryStatesEqual(
      { nodes: previous.nodes, edges: previous.edges },
      { nodes: current.nodes, edges: current.edges }
    )
  ) {
    return true;
  }

  const previousAssetIds = Object.keys(previous.assets);
  const currentAssetIds = Object.keys(current.assets);
  if (previousAssetIds.length !== currentAssetIds.length) return true;

  return previousAssetIds.some((assetId) => {
    const previousAsset = previous.assets[assetId];
    const currentAsset = current.assets[assetId];
    if (!currentAsset) return true;
    if (previousAsset.id !== currentAsset.id) return true;
    if (previousAsset.mimeType !== currentAsset.mimeType) return true;
    if (previousAsset.data.length !== currentAsset.data.length) return true;
    return previousAsset.data !== currentAsset.data;
  });
}

export function ProjectCanvasPageView({
  project,
  saveStatus,
  onBack,
  onRename,
  onOpenSettings = () => {},
  children,
}: ProjectCanvasPageViewProps) {
  const { t } = useAppTranslation();

  return (
    <main className="relative h-screen w-full overflow-hidden" style={{ background: '#16130F' }}>
      <div
        className="absolute right-4 top-4 z-20 flex max-w-[calc(100%-2rem)] flex-wrap items-center justify-end gap-3 rounded-lg border px-3 py-2 shadow-lg backdrop-blur-md"
        style={{ background: 'rgba(29,26,20,0.92)', borderColor: 'rgba(242,193,78,0.2)' }}
      >
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium"
            style={{ background: '#141210', color: '#EEE4CE' }}
          >
            <ArrowLeft size={15} />
            {t('projects.backToList')}
          </button>
          <button
            type="button"
            onClick={onRename}
            className="inline-flex min-w-0 items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold"
            style={{ color: '#EEE4CE' }}
            title={t('projects.rename')}
          >
            <span className="truncate">{project.name}</span>
            <Pencil size={14} className="shrink-0" style={{ color: '#96836F' }} />
          </button>
        </div>
        <div className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs" style={{ color: '#96836F' }}>
          <Save size={14} />
          {t(saveStatusKey(saveStatus))}
        </div>
        <button
          type="button"
          data-app-settings-entry="true"
          onClick={onOpenSettings}
          className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium"
          style={{ background: '#141210', color: '#EEE4CE' }}
        >
          <Settings size={14} />
          {t('settings.title')}
        </button>
      </div>
      {children}
    </main>
  );
}

export function ProjectCanvasPage({
  projectId,
  onOpenSettings,
}: {
  projectId: string;
  onOpenSettings?: () => void;
}) {
  const { t } = useAppTranslation();
  const [status, setStatus] = useState<ProjectLoadStatus>('loading');
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('loading');
  const [project, setProject] = useState<ProjectMeta | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>();
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const saveRevisionRef = useRef(0);
  const lastSavedSnapshotRef = useRef<ProjectSnapshot | null>(null);

  useEffect(() => {
    let disposed = false;

    async function loadProject() {
      try {
        setStatus('loading');
        setSaveStatus('loading');

        const loaded = await projectRepository.loadProject(projectId);
        if (!loaded) {
          if (!disposed) setStatus('missing');
          return;
        }

        useStore.getState().hydrateProject(loaded.snapshot ?? createEmptyProjectSnapshot());
        lastSavedSnapshotRef.current = useStore.getState().exportProject();

        if (disposed) return;
        setProject(loaded.project);
        setSaveStatus('saved');
        setStatus('ready');
      } catch (error) {
        if (disposed) return;
        setErrorMessage(getErrorMessage(error, t('common.unknownError')));
        setSaveStatus('error');
        setStatus('error');
      }
    }

    void loadProject();

    return () => {
      disposed = true;
    };
  }, [projectId, t]);

  useEffect(() => {
    if (status !== 'ready' || !project) return undefined;

    let disposed = false;
    const enqueueSave = (snapshot: ProjectSnapshot) => {
      const revision = ++saveRevisionRef.current;
      const saveTask = saveQueueRef.current
        .catch(() => undefined)
        .then(() => projectRepository.saveProjectSnapshot(project.id, snapshot));

      saveQueueRef.current = saveTask
        .then(() => {
          if (!disposed && revision === saveRevisionRef.current) {
            lastSavedSnapshotRef.current = snapshot;
            setSaveStatus('saved');
          }
        })
        .catch((error) => {
          console.error('Failed to save project snapshot:', error);
          if (!disposed && revision === saveRevisionRef.current) setSaveStatus('error');
        });

      return saveQueueRef.current;
    };
    const saveNow = () => {
      const snapshot = useStore.getState().exportProject();
      if (!hasProjectSnapshotChanged(lastSavedSnapshotRef.current, snapshot)) {
        if (!disposed) setSaveStatus('saved');
        return Promise.resolve();
      }

      setSaveStatus('saving');
      return enqueueSave(snapshot);
    };

    const unsubscribe = useStore.subscribe(() => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

      saveTimeoutRef.current = setTimeout(() => {
        saveTimeoutRef.current = null;
        void saveNow();
      }, 500);
    });

    return () => {
      disposed = true;
      unsubscribe();
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
        void saveNow().catch((error) => {
          console.error('Failed to flush pending project save:', error);
        });
      }
    };
  }, [project, status]);

  const handleRename = () => {
    if (!project) return;
    setIsRenameDialogOpen(true);
  };

  const handleConfirmRename = async (name: string) => {
    if (!project) return;
    setIsRenameDialogOpen(false);
    const renamed = await projectRepository.renameProject(project.id, name);
    if (renamed) setProject(renamed);
  };

  if (status === 'loading') {
    return (
      <main className="flex h-screen items-center justify-center" style={{ background: '#16130F', color: '#96836F' }}>
        {t('projects.loadingProject')}
      </main>
    );
  }

  if (status === 'missing') {
    return <MissingProjectState onBack={navigateToProjects} />;
  }

  if (status === 'error' || !project) {
    return (
      <main className="flex h-screen items-center justify-center px-6" style={{ background: '#16130F', color: '#EEE4CE' }}>
        <section className="rounded-lg border p-8 text-center" style={{ background: '#1D1A14', borderColor: 'rgba(217,123,58,0.3)' }}>
          <h1 className="text-xl font-semibold">{t('projects.loadFailed')}</h1>
          <p className="mt-2 text-sm" style={{ color: '#96836F' }}>{errorMessage || t('projects.openFailed')}</p>
          <button
            type="button"
            onClick={navigateToProjects}
            className="mt-6 rounded-lg px-4 py-2 text-sm font-medium"
            style={{ background: '#F2C14E', color: '#16130F' }}
          >
            {t('projects.backToList')}
          </button>
        </section>
      </main>
    );
  }

  return (
    <>
      <ProjectCanvasPageView
        project={project}
        saveStatus={saveStatus}
        onBack={navigateToProjects}
        onRename={handleRename}
        onOpenSettings={onOpenSettings}
      >
        <Suspense
          fallback={
            <div className="flex h-screen items-center justify-center" style={{ color: '#96836F' }}>
              {t('projects.loadingCanvas')}
            </div>
          }
        >
          <Canvas />
        </Suspense>
      </ProjectCanvasPageView>
      {isRenameDialogOpen && (
        <ProjectNameDialog
          title={t('projects.rename')}
          initialValue={project.name}
          fallbackValue={t('projects.unnamed')}
          confirmLabel={t('common.save')}
          cancelLabel={t('common.cancel')}
          onConfirm={handleConfirmRename}
          onCancel={() => setIsRenameDialogOpen(false)}
        />
      )}
    </>
  );
}
