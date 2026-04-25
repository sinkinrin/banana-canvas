import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';

import { ProjectsList } from '../components/projects/ProjectsList';
import { sortProjectsByUpdatedAt, type ProjectMeta } from '../lib/projects';
import { createProjectRepository } from '../lib/projectRepository';
import { getProjectPath } from '../lib/routes';

type ProjectsPageStatus = 'loading' | 'ready' | 'error';

const projectRepository = createProjectRepository();

export type ProjectsPageViewProps = {
  status: ProjectsPageStatus;
  projects: ProjectMeta[];
  errorMessage?: string;
  onCreate: () => void;
  onOpen: (projectId: string) => void;
  onRename: (projectId: string) => void;
  onDelete: (projectId: string) => void;
};

function navigateTo(path: string) {
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : '未知错误';
}

export function ProjectsPageView({
  status,
  projects,
  errorMessage,
  onCreate,
  onOpen,
  onRename,
  onDelete,
}: ProjectsPageViewProps) {
  if (status === 'loading') {
    return (
      <main className="flex min-h-screen items-center justify-center" style={{ background: '#16130F' }}>
        <div className="flex items-center gap-3 text-sm" style={{ color: '#96836F' }}>
          <div
            className="h-5 w-5 animate-spin rounded-full border-2 border-t-transparent"
            style={{ borderColor: 'rgba(242,193,78,0.6)', borderTopColor: 'transparent' }}
          />
          加载项目中...
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
          <h1 className="mt-4 text-xl font-semibold">项目加载失败</h1>
          <p className="mt-2 text-sm leading-6" style={{ color: '#96836F' }}>
            {errorMessage || '无法读取本地项目数据。'}
          </p>
          <button
            type="button"
            onClick={onCreate}
            className="mt-6 rounded-lg px-4 py-2 text-sm font-medium"
            style={{ background: '#F2C14E', color: '#16130F' }}
          >
            新建项目
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
    />
  );
}

export function ProjectsPage() {
  const [status, setStatus] = useState<ProjectsPageStatus>('loading');
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [errorMessage, setErrorMessage] = useState<string>();

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
        setErrorMessage(getErrorMessage(error));
        setStatus('error');
      }
    }

    void loadProjects();

    return () => {
      disposed = true;
    };
  }, []);

  const handleCreate = async () => {
    try {
      const name = window.prompt('项目名称', '未命名项目') ?? '未命名项目';
      const project = await projectRepository.createProject(name);
      navigateTo(getProjectPath(project.id));
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
      setStatus('error');
    }
  };

  const handleOpen = (projectId: string) => {
    navigateTo(getProjectPath(projectId));
  };

  const handleRename = async (projectId: string) => {
    const project = projects.find((item) => item.id === projectId);
    if (!project) return;

    const nextName = window.prompt('项目名称', project.name);
    if (nextName === null) return;

    await projectRepository.renameProject(projectId, nextName);
    await refreshProjects();
  };

  const handleDelete = async (projectId: string) => {
    const project = projects.find((item) => item.id === projectId);
    if (!project) return;

    if (!window.confirm(`删除项目“${project.name}”？此操作不会进入回收站。`)) return;

    const nextProjects = projects.filter((item) => item.id !== projectId);
    await projectRepository.deleteProject(projectId);
    setProjects(sortProjectsByUpdatedAt(nextProjects));
    await refreshProjects();
  };

  return (
    <ProjectsPageView
      status={status}
      projects={projects}
      errorMessage={errorMessage}
      onCreate={handleCreate}
      onOpen={handleOpen}
      onRename={handleRename}
      onDelete={handleDelete}
    />
  );
}
