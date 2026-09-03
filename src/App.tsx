/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { useAppTranslation } from './i18n';

import { RuntimeSettingsDialog } from './components/settings/RuntimeSettingsDialog';
import { parseAppRoute, type AppRoute } from './lib/routes';
import { notifyDesktopLanguage } from './lib/desktopUpdates';
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
  const { t, i18n } = useAppTranslation();
  const [route, setRoute] = useState<AppRoute>(() => getCurrentRoute());
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  useEffect(() => {
    const handleRouteChange = () => setRoute(getCurrentRoute());

    window.addEventListener('popstate', handleRouteChange);
    return () => window.removeEventListener('popstate', handleRouteChange);
  }, []);

  useEffect(() => {
    document.documentElement.lang = i18n.resolvedLanguage ?? i18n.language;
    document.title = t('app.name');
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute('content', t('app.tagline'));
    void notifyDesktopLanguage(i18n.resolvedLanguage ?? i18n.language);
  }, [i18n.language, i18n.resolvedLanguage, t]);

  return (
    <>
      <AppRouter route={route} onOpenSettings={() => setIsSettingsOpen(true)} />
      {isSettingsOpen && <RuntimeSettingsDialog onClose={() => setIsSettingsOpen(false)} />}
    </>
  );
}
