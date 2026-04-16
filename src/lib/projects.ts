import { v4 as uuidv4 } from 'uuid';

export type ProjectMeta = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

const DEFAULT_PROJECT_NAME = '未命名项目';

export function createProjectMeta(name: string): ProjectMeta {
  const now = new Date().toISOString();

  return {
    id: uuidv4(),
    name: name.trim() || DEFAULT_PROJECT_NAME,
    createdAt: now,
    updatedAt: now,
  };
}

export function renameProject(project: ProjectMeta, nextName: string): ProjectMeta {
  return {
    ...project,
    name: nextName.trim() || DEFAULT_PROJECT_NAME,
    updatedAt: new Date().toISOString(),
  };
}

export function sortProjectsByUpdatedAt(projects: ProjectMeta[]) {
  return [...projects].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}
