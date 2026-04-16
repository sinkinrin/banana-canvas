export type AppRoute =
  | { name: 'projects' }
  | { name: 'project'; projectId: string };

export function parseAppRoute(pathname: string): AppRoute {
  const match = pathname.match(/^\/projects\/([^/]+)$/);

  if (match) {
    try {
      return {
        name: 'project',
        projectId: decodeURIComponent(match[1]),
      };
    } catch {
      return { name: 'projects' };
    }
  }

  return { name: 'projects' };
}

export function getProjectPath(projectId: string) {
  return `/projects/${encodeURIComponent(projectId)}`;
}
