import { BookOpen, FolderOpen, Pencil, Plus, Settings, Trash2 } from 'lucide-react';
import { useAppTranslation } from '../../i18n';

import { APP_VERSION } from '../../lib/appVersion';
import type { ProjectMeta } from '../../lib/projects';

export type ProjectsListProps = {
  projects: ProjectMeta[];
  onCreate: () => void;
  onOpen: (projectId: string) => void;
  onRename: (projectId: string) => void;
  onDelete: (projectId: string) => void;
  onOpenSettings?: () => void;
  onOpenPromptLibrary?: () => void;
};

function formatProjectTime(value: string, locale: string, emptyLabel: string) {
  if (!value) return emptyLabel;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return emptyLabel;

  return date.toLocaleString(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ProjectsList({
  projects,
  onCreate,
  onOpen,
  onRename,
  onDelete,
  onOpenSettings = () => {},
  onOpenPromptLibrary = () => {},
}: ProjectsListProps) {
  const { t, i18n } = useAppTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language;

  return (
    <section className="min-h-screen px-6 py-8" style={{ background: '#16130F', color: '#EEE4CE' }}>
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-baseline gap-2">
              <h1 className="text-2xl font-bold">{t('app.name')}</h1>
              <span className="text-xs font-medium" style={{ color: '#96836F' }}>
                v{APP_VERSION}
              </span>
            </div>
            <p className="mt-1 text-sm" style={{ color: '#96836F' }}>
              {t('app.localProjects')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onOpenPromptLibrary}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
              style={{ background: '#1D1A14', border: '1px solid rgba(242,193,78,0.2)', color: '#EEE4CE' }}
            >
              <BookOpen size={16} />
              {t('promptLibrary.title')}
            </button>
            <button
              type="button"
              data-app-settings-entry="true"
              onClick={onOpenSettings}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
              style={{ background: '#1D1A14', border: '1px solid rgba(242,193,78,0.2)', color: '#EEE4CE' }}
            >
              <Settings size={16} />
              {t('settings.title')}
            </button>
            <button
              type="button"
              onClick={onCreate}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
              style={{ background: '#F2C14E', color: '#16130F' }}
            >
              <Plus size={16} />
              {t('projects.new')}
            </button>
          </div>
        </header>

        {projects.length === 0 ? (
          <div
            className="flex min-h-[320px] flex-col items-center justify-center rounded-lg border px-6 text-center"
            style={{ background: '#1D1A14', borderColor: 'rgba(242,193,78,0.2)' }}
          >
            <FolderOpen size={40} style={{ color: '#F2C14E' }} />
            <h2 className="mt-4 text-xl font-semibold">{t('projects.noProjects')}</h2>
            <p className="mt-2 max-w-sm text-sm leading-6" style={{ color: '#96836F' }}>
              {t('projects.noProjectsDescription')}
            </p>
            <button
              type="button"
              onClick={onCreate}
              className="mt-6 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
              style={{ background: '#F2C14E', color: '#16130F' }}
            >
              <Plus size={16} />
              {t('projects.createFirst')}
            </button>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <article
                key={project.id}
                className="rounded-lg border p-4"
                style={{ background: '#1D1A14', borderColor: 'rgba(242,193,78,0.14)' }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-base font-semibold" title={project.name}>
                      {project.name}
                    </h2>
                    <p className="mt-1 text-xs" style={{ color: '#96836F' }}>
                      {t('projects.updatedAt', {
                        time: formatProjectTime(project.updatedAt, locale, t('projects.noSaveRecord')),
                      })}
                    </p>
                  </div>
                  <FolderOpen size={18} className="shrink-0" style={{ color: '#F2C14E' }} />
                </div>

                <div className="mt-5 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onOpen(project.id)}
                    className="flex-1 rounded-lg px-3 py-2 text-sm font-medium"
                    style={{ background: 'rgba(242,193,78,0.14)', color: '#F2C14E' }}
                  >
                    {t('projects.open')}
                  </button>
                  <button
                    type="button"
                    aria-label={t('projects.renameAria', { name: project.name })}
                    onClick={() => onRename(project.id)}
                    className="rounded-lg p-2"
                    style={{ background: '#141210', color: '#96836F' }}
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    type="button"
                    aria-label={t('projects.deleteAria', { name: project.name })}
                    onClick={() => onDelete(project.id)}
                    className="rounded-lg p-2"
                    style={{ background: '#141210', color: '#D97B3A' }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
