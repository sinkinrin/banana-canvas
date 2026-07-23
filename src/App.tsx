/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';

import { RuntimeSettingsDialog } from './components/settings/RuntimeSettingsDialog';
import { parseAppRoute, type AppRoute } from './lib/routes';
import { ProjectCanvasPage } from './pages/ProjectCanvasPage';
import { ProjectsPage } from './pages/ProjectsPage';

function getCurrentRoute() {
  if (typeof window === 'undefined') return { name: 'projects' } as const;
  return parseAppRoute(window.location.pathname);
}

export function AppRouter({
  route,
  onOpenSettings = () => {},
}: {
  route: AppRoute;
  onOpenSettings?: () => void;
}) {
  if (route.name === 'project') {
    return <ProjectCanvasPage projectId={route.projectId} onOpenSettings={onOpenSettings} />;
  }

  return <ProjectsPage onOpenSettings={onOpenSettings} />;
}

export default function App() {
  const [route, setRoute] = useState<AppRoute>(() => getCurrentRoute());
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  useEffect(() => {
    const handleRouteChange = () => setRoute(getCurrentRoute());

    window.addEventListener('popstate', handleRouteChange);
    return () => window.removeEventListener('popstate', handleRouteChange);
  }, []);

  return (
    <>
      <AppRouter route={route} onOpenSettings={() => setIsSettingsOpen(true)} />
      {isSettingsOpen && <RuntimeSettingsDialog onClose={() => setIsSettingsOpen(false)} />}
    </>
  );
}
