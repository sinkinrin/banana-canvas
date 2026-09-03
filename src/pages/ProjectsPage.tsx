import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useAppTranslation } from '../i18n';

import { ConfirmDialog } from '../components/projects/ConfirmDialog';
import { ProjectNameDialog } from '../components/projects/ProjectNameDialog';
import { ProjectsList } from '../components/projects/ProjectsList';
import { createProjectDialogCallbacks } from '../components/projects/projectDialogLogic';
import { sortProjectsByUpdatedAt, type ProjectMeta } from '../lib/projects';
import { createProjectRepository } from '../lib/projectRepository';
import { getProjectPath } from '../lib/routes';
import { PromptLibraryDialog } from '../components/prompts/PromptLibraryDialog';

type ProjectsPageStatus = 'loading' | 'ready' | 'error';
type ProjectDialogState =
  | { type: 'create' }
  | { type: 'rename'; project: ProjectMeta }
  | { type: 'delete'; project: ProjectMeta }
  | null;

const projectRepository = createProjectRepository();

export type ProjectsPageViewProps = {
  status: ProjectsPageStatus;
  projects: ProjectMeta[];
  errorMessage?: string;
  onCreate: () => void;
  onOpen: (projectId: string) => void;
  onRename: (projectId: string) => void;
  onDelete: (projectId: string) => void;
  onOpenSettings?: () => void;
  onOpenPromptLibrary?: () => void;
};

function navigateTo(path: string) {
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function ProjectsPageView({
  status,
  projects,
  errorMessage,
  onCreate,
  onOpen,
  onRename,
  onDelete,
  onOpenSettings,
  onOpenPromptLibrary,
}: ProjectsPageViewProps) {
  const { t } = useAppTranslation();

  if (status === 'loading') {
    return (
      <main className="flex min-h-screen items-center justify-center" style={{ background: '#16130F' }}>
        <div className="flex items-center gap-3 text-sm" style={{ color: '#96836F' }}>
          <div
            className="h-5 w-5 animate-spin rounded-full border-2 border-t-transparent"
            style={{ borderColor: 'rgba(242,193,78,0.6)', borderTopColor: 'transparent' }}
          />
          {t('projects.loading')}
        </div>
      </main>
    );
  }

  if (status === 'error') {
    return (
      <main className="flex min-h-screen items-center justify-center px-6" style={{ background: '#16130F' }}>
        <section
          className="w-full max-w-md rounded-lg border p-8 text-center"
          style={{ background: '#1D1A14', borderColor: 'rgba(217,123,58,0.3)', color: '#EEE4CE' }}
        >
          <AlertTriangle size={40} className="mx-auto" style={{ color: '#D97B3A' }} />
          <h1 className="mt-4 text-xl font-semibold">{t('projects.loadFailed')}</h1>
          <p className="mt-2 text-sm leading-6" style={{ color: '#96836F' }}>
            {errorMessage || t('projects.readFailed')}
          </p>
          <button
            type="button"
            onClick={onCreate}
            className="mt-6 rounded-lg px-4 py-2 text-sm font-medium"
            style={{ background: '#F2C14E', color: '#16130F' }}
          >
            {t('projects.new')}
          </button>
        </section>
      </main>
    );
  }

  return (
    <ProjectsList
      projects={projects}
      onCreate={onCreate}
      onOpen={onOpen}
      onRename={onRename}
      onDelete={onDelete}
      onOpenSettings={onOpenSettings}
      onOpenPromptLibrary={onOpenPromptLibrary}
    />
  );
}

export function ProjectsPage({ onOpenSettings }: { onOpenSettings?: () => void }) {
  const { t } = useAppTranslation();
  const [status, setStatus] = useState<ProjectsPageStatus>('loading');
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [errorMessage, setErrorMessage] = useState<string>();
  const [dialog, setDialog] = useState<ProjectDialogState>(null);
  const [isPromptLibraryOpen, setIsPromptLibraryOpen] = useState(false);

  const refreshProjects = async () => {
    const index = await projectRepository.listProjects();
    setProjects(sortProjectsByUpdatedAt(index));
  };

  useEffect(() => {
    let disposed = false;

    async function loadProjects() {
      try {
        const index = await projectRepository.listProjects();
        if (disposed) return;
        setProjects(sortProjectsByUpdatedAt(index));
        setStatus('ready');
      } catch (error) {
        if (disposed) return;
        setErrorMessage(getErrorMessage(error, t('common.unknownError')));
        setStatus('error');
      }
    }

    void loadProjects();

    return () => {
      disposed = true;
    };
  }, [t]);

  const dialogCallbacks = createProjectDialogCallbacks({
    projectRepository,
    closeDialog: () => setDialog(null),
    refreshProjects,
    navigateTo,
    getProjectPath,
    afterDelete: (projectId) => {
      setProjects(sortProjectsByUpdatedAt(projects.filter((item) => item.id !== projectId)));
    },
    onError: (error) => {
      setErrorMessage(getErrorMessage(error, t('common.unknownError')));
      setStatus('error');
    },
  });

  const handleCreate = () => setDialog({ type: 'create' });

  const handleOpen = (projectId: string) => {
    navigateTo(getProjectPath(projectId));
  };

  const handleRename = (projectId: string) => {
    const project = projects.find((item) => item.id === projectId);
    if (project) setDialog({ type: 'rename', project });
  };

  const handleDelete = (projectId: string) => {
    const project = projects.find((item) => item.id === projectId);
    if (project) setDialog({ type: 'delete', project });
  };

  return (
    <>
      <ProjectsPageView
        status={status}
        projects={projects}
        errorMessage={errorMessage}
        onCreate={handleCreate}
        onOpen={handleOpen}
        onRename={handleRename}
        onDelete={handleDelete}
        onOpenSettings={onOpenSettings}
        onOpenPromptLibrary={() => setIsPromptLibraryOpen(true)}
      />
      {dialog?.type === 'create' && (
        <ProjectNameDialog
          title={t('projects.new')}
          initialValue={t('projects.unnamed')}
          fallbackValue={t('projects.unnamed')}
          confirmLabel={t('common.create')}
          cancelLabel={t('common.cancel')}
          onConfirm={dialogCallbacks.confirmCreate}
          onCancel={() => setDialog(null)}
        />
      )}
      {dialog?.type === 'rename' && (
        <ProjectNameDialog
          title={t('projects.rename')}
          initialValue={dialog.project.name}
          fallbackValue={t('projects.unnamed')}
          confirmLabel={t('common.save')}
          cancelLabel={t('common.cancel')}
          onConfirm={(name) => dialogCallbacks.confirmRename(dialog.project.id, name)}
          onCancel={() => setDialog(null)}
        />
      )}
      {dialog?.type === 'delete' && (
        <ConfirmDialog
          title={t('projects.delete')}
          body={t('projects.deleteConfirmation', { name: dialog.project.name })}
          confirmLabel={t('common.delete')}
          cancelLabel={t('common.cancel')}
          onConfirm={() => dialogCallbacks.confirmDelete(dialog.project.id)}
          onCancel={() => setDialog(null)}
        />
      )}
      {isPromptLibraryOpen && (
        <PromptLibraryDialog onClose={() => setIsPromptLibraryOpen(false)} />
      )}
    </>
  );
}
