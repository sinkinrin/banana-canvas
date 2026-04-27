export const DEFAULT_PROJECT_DIALOG_NAME = '未命名项目';

export function getProjectNameSubmissionValue(value: string) {
  return value.trim() ? value : DEFAULT_PROJECT_DIALOG_NAME;
}

export function shouldCloseDialogForKey(key: string) {
  return key === 'Escape';
}

type ProjectDialogRepository = {
  createProject: (name: string) => Promise<{ id: string }>;
  renameProject: (projectId: string, name: string) => Promise<unknown>;
  deleteProject: (projectId: string) => Promise<unknown>;
};

export function createProjectDialogCallbacks({
  projectRepository,
  closeDialog,
  refreshProjects,
  navigateTo,
  getProjectPath,
  afterDelete,
  onError,
}: {
  projectRepository: ProjectDialogRepository;
  closeDialog: () => void;
  refreshProjects: () => Promise<void>;
  navigateTo: (path: string) => void;
  getProjectPath: (projectId: string) => string;
  afterDelete?: (projectId: string) => void | Promise<void>;
  onError?: (error: unknown) => void | Promise<void>;
}) {
  const cancel = () => closeDialog();

  async function runDialogAction(action: () => Promise<void>) {
    try {
      await action();
    } catch (error) {
      await onError?.(error);
    }
  }

  return {
    cancel,
    handleKeyDown(key: string) {
      if (shouldCloseDialogForKey(key)) cancel();
    },
    async confirmCreate(name: string) {
      await runDialogAction(async () => {
        closeDialog();
        const project = await projectRepository.createProject(name);
        navigateTo(getProjectPath(project.id));
      });
    },
    async confirmRename(projectId: string, name: string) {
      await runDialogAction(async () => {
        closeDialog();
        await projectRepository.renameProject(projectId, name);
        await refreshProjects();
      });
    },
    async confirmDelete(projectId: string) {
      await runDialogAction(async () => {
        closeDialog();
        await projectRepository.deleteProject(projectId);
        await afterDelete?.(projectId);
        await refreshProjects();
      });
    },
  };
}
