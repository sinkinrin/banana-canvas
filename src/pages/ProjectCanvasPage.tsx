import { Suspense, lazy, useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, Pencil, Save } from 'lucide-react';

import { MissingProjectState } from '../components/projects/MissingProjectState';
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
  children?: ReactNode;
};

function navigateToProjects() {
  window.history.pushState({}, '', '/');
  window.dispatchEvent(new PopStateEvent('popstate'));
}

function saveStatusText(saveStatus: SaveStatus) {
  if (saveStatus === 'loading') return '加载中';
  if (saveStatus === 'saving') return '保存中';
  if (saveStatus === 'error') return '保存失败';
  return '已保存';
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : '未知错误';
}

export function hasProjectSnapshotChanged(previous: ProjectSnapshot | null, current: ProjectSnapshot) {
  if (!previous) return true;
  return JSON.stringify(previous) !== JSON.stringify(current);
}

export function ProjectCanvasPageView({
  project,
  saveStatus,
  onBack,
  onRename,
  children,
}: ProjectCanvasPageViewProps) {
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
            返回项目列表
          </button>
          <button
            type="button"
            onClick={onRename}
            className="inline-flex min-w-0 items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold"
            style={{ color: '#EEE4CE' }}
            title="重命名项目"
          >
            <span className="truncate">{project.name}</span>
            <Pencil size={14} className="shrink-0" style={{ color: '#96836F' }} />
          </button>
        </div>
        <div className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs" style={{ color: '#96836F' }}>
          <Save size={14} />
          {saveStatusText(saveStatus)}
        </div>
      </div>
      {children}
    </main>
  );
}

export function ProjectCanvasPage({ projectId }: { projectId: string }) {
  const [status, setStatus] = useState<ProjectLoadStatus>('loading');
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('loading');
  const [project, setProject] = useState<ProjectMeta | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>();
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
        setErrorMessage(getErrorMessage(error));
        setSaveStatus('error');
        setStatus('error');
      }
    }

    void loadProject();

    return () => {
      disposed = true;
    };
  }, [projectId]);

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

  const handleRename = async () => {
    if (!project) return;

    const nextName = window.prompt('项目名称', project.name);
    if (nextName === null) return;

    const renamed = await projectRepository.renameProject(project.id, nextName);
    if (renamed) setProject(renamed);
  };

  if (status === 'loading') {
    return (
      <main className="flex h-screen items-center justify-center" style={{ background: '#16130F', color: '#96836F' }}>
        加载项目中...
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
          <h1 className="text-xl font-semibold">项目加载失败</h1>
          <p className="mt-2 text-sm" style={{ color: '#96836F' }}>{errorMessage || '无法打开这个项目。'}</p>
          <button
            type="button"
            onClick={navigateToProjects}
            className="mt-6 rounded-lg px-4 py-2 text-sm font-medium"
            style={{ background: '#F2C14E', color: '#16130F' }}
          >
            返回项目列表
          </button>
        </section>
      </main>
    );
  }

  return (
    <ProjectCanvasPageView
      project={project}
      saveStatus={saveStatus}
      onBack={navigateToProjects}
      onRename={handleRename}
    >
      <Suspense
        fallback={
          <div className="flex h-screen items-center justify-center" style={{ color: '#96836F' }}>
            加载画布中...
          </div>
        }
      >
        <Canvas />
      </Suspense>
    </ProjectCanvasPageView>
  );
}
