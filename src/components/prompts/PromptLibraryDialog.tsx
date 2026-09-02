import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  BookOpen,
  Check,
  Copy,
  Loader2,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';

import { copyTextToClipboard } from '../../lib/clipboard';
import {
  filterPromptTemplates,
  parsePromptTags,
  sortPromptTemplates,
  type PromptTemplate,
  type PromptTemplateDraft,
} from '../../lib/prompts';
import {
  createPromptTemplate,
  deletePromptTemplate,
  loadPromptTemplates,
  updatePromptTemplate,
} from '../../services/prompts';

type PromptEditorState = Omit<PromptTemplateDraft, 'tags'> & {
  id?: string;
  tagsText: string;
};

const inputClassName = 'w-full rounded-lg border px-3 py-2 text-sm outline-none';
const inputStyle = {
  background: '#141210',
  borderColor: 'rgba(242,193,78,0.2)',
  color: '#EEE4CE',
};

export function PromptLibraryDialog({
  onClose,
  onUsePrompt,
  initialPrompt = '',
}: {
  onClose: () => void;
  onUsePrompt?: (prompt: string) => void;
  initialPrompt?: string;
}) {
  const [prompts, setPrompts] = useState<PromptTemplate[]>([]);
  const [query, setQuery] = useState('');
  const [editor, setEditor] = useState<PromptEditorState>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>();
  const [copiedId, setCopiedId] = useState<string>();
  const [deleteConfirmationId, setDeleteConfirmationId] = useState<string>();

  useEffect(() => {
    const controller = new AbortController();
    loadPromptTemplates(controller.signal)
      .then((items) => setPrompts(sortPromptTemplates(items)))
      .catch((error) => {
        if (!controller.signal.aborted) {
          setErrorMessage(error instanceof Error ? error.message : '加载提示词库失败');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const filteredPrompts = useMemo(
    () => filterPromptTemplates(prompts, query),
    [prompts, query]
  );

  const startCreate = (content = '') => {
    setEditor({ title: '', content, tagsText: '' });
    setErrorMessage(undefined);
  };

  const handleSave = async () => {
    if (!editor || !editor.content.trim()) {
      setErrorMessage('请输入提示词内容。');
      return;
    }
    setSaving(true);
    setErrorMessage(undefined);
    try {
      const draft: PromptTemplateDraft = {
        title: editor.title,
        content: editor.content,
        tags: parsePromptTags(editor.tagsText),
      };
      const saved = editor.id
        ? await updatePromptTemplate(editor.id, draft)
        : await createPromptTemplate(draft);
      setPrompts((items) => sortPromptTemplates([
        saved,
        ...items.filter((item) => item.id !== saved.id),
      ]));
      setEditor(undefined);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '保存提示词失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (promptId: string) => {
    if (deleteConfirmationId !== promptId) {
      setDeleteConfirmationId(promptId);
      return;
    }
    setErrorMessage(undefined);
    try {
      await deletePromptTemplate(promptId);
      setPrompts((items) => items.filter((item) => item.id !== promptId));
      setDeleteConfirmationId(undefined);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '删除提示词失败');
    }
  };

  const dialog = (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        data-prompt-library-dialog="true"
        role="dialog"
        aria-modal="true"
        aria-labelledby="prompt-library-title"
        className="relative flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border shadow-2xl"
        style={{ background: '#1D1A14', borderColor: 'rgba(242,193,78,0.24)', color: '#EEE4CE' }}
      >
        <header className="flex flex-wrap items-center justify-between gap-3 border-b px-6 py-4" style={{ borderColor: 'rgba(242,193,78,0.14)' }}>
          <div className="flex items-center gap-3">
            <div className="rounded-xl p-2" style={{ background: 'rgba(242,193,78,0.12)', color: '#F2C14E' }}>
              <BookOpen size={20} />
            </div>
            <div>
              <h2 id="prompt-library-title" className="text-lg font-semibold">提示词管理</h2>
              <p className="mt-0.5 text-xs" style={{ color: '#96836F' }}>跨项目保存、搜索和复用常用提示词。</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {initialPrompt.trim() && (
              <button
                type="button"
                onClick={() => startCreate(initialPrompt)}
                className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium"
                style={{ background: 'rgba(124,203,138,0.1)', color: '#7CCB8A' }}
              >
                <Sparkles size={14} />
                收藏当前提示词
              </button>
            )}
            <button
              type="button"
              onClick={() => startCreate()}
              className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium"
              style={{ background: '#F2C14E', color: '#16130F' }}
            >
              <Plus size={14} />
              新建提示词
            </button>
            <button type="button" aria-label="关闭提示词管理" onClick={onClose} className="rounded-lg p-2" style={{ color: '#96836F' }}>
              <X size={18} />
            </button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-6">
          <label className="relative block">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#96836F' }} />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索标题、内容或标签"
              className={`${inputClassName} pl-10`}
              style={inputStyle}
            />
          </label>

          {errorMessage && (
            <div className="rounded-lg border px-4 py-3 text-sm" style={{ borderColor: 'rgba(217,123,58,0.3)', color: '#D97B3A', background: 'rgba(217,123,58,0.08)' }}>
              {errorMessage}
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            {loading ? (
              <div className="flex min-h-64 items-center justify-center gap-2 text-sm" style={{ color: '#96836F' }}>
                <Loader2 size={17} className="animate-spin" />
                加载提示词库中…
              </div>
            ) : filteredPrompts.length === 0 ? (
              <div className="flex min-h-64 flex-col items-center justify-center rounded-xl border border-dashed px-6 text-center" style={{ borderColor: 'rgba(242,193,78,0.18)', color: '#96836F' }}>
                <BookOpen size={34} style={{ color: '#F2C14E' }} />
                <p className="mt-3 text-sm font-medium" style={{ color: '#EEE4CE' }}>
                  {query ? '没有匹配的提示词' : '提示词库还是空的'}
                </p>
                <p className="mt-1 text-xs">新建一条，或从创作节点收藏当前提示词。</p>
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {filteredPrompts.map((prompt) => (
                  <article key={prompt.id} className="rounded-xl border p-4" style={{ background: '#18150F', borderColor: 'rgba(242,193,78,0.13)' }}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate font-semibold" title={prompt.title}>{prompt.title}</h3>
                        {prompt.tags.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {prompt.tags.map((tag) => (
                              <span key={tag} className="rounded-full px-2 py-0.5 text-[10px]" style={{ background: 'rgba(242,193,78,0.1)', color: '#D7BC7C' }}>
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <p className="mt-3 line-clamp-4 whitespace-pre-wrap text-xs leading-5" style={{ color: '#96836F' }} title={prompt.content}>
                      {prompt.content}
                    </p>
                    <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-3" style={{ borderColor: 'rgba(242,193,78,0.08)' }}>
                      {onUsePrompt && (
                        <button
                          type="button"
                          onClick={() => {
                            onUsePrompt(prompt.content);
                            onClose();
                          }}
                          className="rounded-lg px-3 py-1.5 text-xs font-medium"
                          style={{ background: '#F2C14E', color: '#16130F' }}
                        >
                          使用此提示词
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          void copyTextToClipboard(prompt.content).then(() => {
                            setCopiedId(prompt.id);
                            setTimeout(() => setCopiedId(undefined), 1_800);
                          }).catch((error) => setErrorMessage(error instanceof Error ? error.message : '复制失败'));
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs"
                        style={{ background: '#141210', color: '#B8A58D' }}
                      >
                        {copiedId === prompt.id ? <Check size={13} /> : <Copy size={13} />}
                        {copiedId === prompt.id ? '已复制' : '复制'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setErrorMessage(undefined);
                          setEditor({ id: prompt.id, title: prompt.title, content: prompt.content, tagsText: prompt.tags.join('，') });
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs"
                        style={{ background: '#141210', color: '#B8A58D' }}
                      >
                        <Pencil size={13} />编辑
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(prompt.id)}
                        className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs"
                        style={{ background: deleteConfirmationId === prompt.id ? 'rgba(217,123,58,0.18)' : '#141210', color: '#D97B3A' }}
                      >
                        <Trash2 size={13} />
                        {deleteConfirmationId === prompt.id ? '确认删除' : '删除'}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </div>

        {editor && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm">
            <form
              data-prompt-library-editor="true"
              className="w-full max-w-2xl rounded-2xl border p-5 shadow-2xl"
              style={{ background: '#1D1A14', borderColor: 'rgba(242,193,78,0.24)' }}
              onSubmit={(event) => {
                event.preventDefault();
                void handleSave();
              }}
            >
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">{editor.id ? '编辑提示词' : '新建提示词'}</h3>
                <button type="button" onClick={() => setEditor(undefined)} className="rounded-lg p-2" style={{ color: '#96836F' }}><X size={16} /></button>
              </div>
              <div className="mt-4 space-y-4">
                {errorMessage && (
                  <div className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: 'rgba(217,123,58,0.3)', color: '#D97B3A', background: 'rgba(217,123,58,0.08)' }}>
                    {errorMessage}
                  </div>
                )}
                <label className="block space-y-1.5">
                  <span className="text-xs" style={{ color: '#B8A58D' }}>标题（留空将从内容生成）</span>
                  <input
                    value={editor.title}
                    maxLength={120}
                    onChange={(event) => setEditor({ ...editor, title: event.target.value })}
                    className={inputClassName}
                    style={inputStyle}
                    placeholder="例如：电影感产品海报"
                  />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-xs" style={{ color: '#B8A58D' }}>提示词内容</span>
                  <textarea
                    autoFocus
                    value={editor.content}
                    maxLength={20_000}
                    onChange={(event) => setEditor({ ...editor, content: event.target.value })}
                    className={`${inputClassName} min-h-48 resize-y`}
                    style={inputStyle}
                    placeholder="输入完整提示词…"
                  />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-xs" style={{ color: '#B8A58D' }}>标签（使用逗号分隔）</span>
                  <input
                    value={editor.tagsText}
                    onChange={(event) => setEditor({ ...editor, tagsText: event.target.value })}
                    className={inputClassName}
                    style={inputStyle}
                    placeholder="海报，摄影，电影感"
                  />
                </label>
              </div>
              <footer className="mt-5 flex justify-end gap-2">
                <button type="button" onClick={() => setEditor(undefined)} className="rounded-lg px-4 py-2 text-sm" style={{ background: '#141210', color: '#B8A58D' }}>取消</button>
                <button type="submit" disabled={saving || !editor.content.trim()} className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50" style={{ background: '#F2C14E', color: '#16130F' }}>
                  {saving && <Loader2 size={14} className="animate-spin" />}
                  保存提示词
                </button>
              </footer>
            </form>
          </div>
        )}
      </section>
    </div>
  );

  return typeof document === 'undefined' ? dialog : createPortal(dialog, document.body);
}
