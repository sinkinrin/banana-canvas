import { FolderOpen, Pencil, Plus, Trash2 } from 'lucide-react';

import type { ProjectMeta } from '../../lib/projects';

export type ProjectsListProps = {
  projects: ProjectMeta[];
  onCreate: () => void;
  onOpen: (projectId: string) => void;
  onRename: (projectId: string) => void;
  onDelete: (projectId: string) => void;
};

function formatProjectTime(value: string) {
  if (!value) return '暂无保存记录';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '暂无保存记录';

  return date.toLocaleString('zh-CN', {
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
}: ProjectsListProps) {
  return (
    <section className="min-h-screen px-6 py-8" style={{ background: '#16130F', color: '#EEE4CE' }}>
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">香蕉画图</h1>
            <p className="mt-1 text-sm" style={{ color: '#96836F' }}>
              本地项目
            </p>
          </div>
          <button
            type="button"
            onClick={onCreate}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
            style={{ background: '#F2C14E', color: '#16130F' }}
          >
            <Plus size={16} />
            新建项目
          </button>
        </header>

        {projects.length === 0 ? (
          <div
            className="flex min-h-[320px] flex-col items-center justify-center rounded-lg border px-6 text-center"
            style={{ background: '#1D1A14', borderColor: 'rgba(242,193,78,0.2)' }}
          >
            <FolderOpen size={40} style={{ color: '#F2C14E' }} />
            <h2 className="mt-4 text-xl font-semibold">还没有项目</h2>
            <p className="mt-2 max-w-sm text-sm leading-6" style={{ color: '#96836F' }}>
              创建第一个项目，开始保存独立的画布和图像资产。
            </p>
            <button
              type="button"
              onClick={onCreate}
              className="mt-6 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
              style={{ background: '#F2C14E', color: '#16130F' }}
            >
              <Plus size={16} />
              创建第一个项目
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
                      更新于 {formatProjectTime(project.updatedAt)}
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
                    打开
                  </button>
                  <button
                    type="button"
                    aria-label={`重命名 ${project.name}`}
                    onClick={() => onRename(project.id)}
                    className="rounded-lg p-2"
                    style={{ background: '#141210', color: '#96836F' }}
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    type="button"
                    aria-label={`删除 ${project.name}`}
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
