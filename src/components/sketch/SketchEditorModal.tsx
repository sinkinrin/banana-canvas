import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAppTranslation } from '../../i18n';
import {
  ArrowUpRight,
  Check,
  Eraser,
  Loader2,
  Minus,
  MousePointer2,
  Pencil,
  Redo2,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import {
  Quickdraw,
  type ColorId,
  type Editor,
  type SizeId,
  type Snapshot,
  type ToolId,
} from '@quickdrawjs/react';

import type { BananaAspectRatio } from '../../lib/imageModels';
import {
  exportFixedArtboardPng,
  getAspectRatioValue,
  getFixedArtboardCamera,
  getSketchArtboard,
  type SketchSavePayload,
} from './sketchGeometry';

type SketchEditorModalProps = {
  aspectRatio: BananaAspectRatio;
  initialSnapshot?: Snapshot;
  onClose: () => void;
  onApply: (payload: SketchSavePayload) => Promise<void> | void;
};

const TOOL_OPTIONS: Array<{
  id: ToolId;
  labelKey: string;
  icon: typeof Pencil;
}> = [
  { id: 'draw', labelKey: 'sketch.tools.draw', icon: Pencil },
  { id: 'eraser', labelKey: 'sketch.tools.eraser', icon: Eraser },
  { id: 'select', labelKey: 'sketch.tools.select', icon: MousePointer2 },
  { id: 'line', labelKey: 'sketch.tools.line', icon: Minus },
  { id: 'arrow', labelKey: 'sketch.tools.arrow', icon: ArrowUpRight },
];

const COLOR_OPTIONS: Array<{ id: ColorId; labelKey: string; color: string }> = [
  { id: 'black', labelKey: 'sketch.colors.black', color: '#1C1B18' },
  { id: 'blue', labelKey: 'sketch.colors.blue', color: '#2F80EC' },
  { id: 'red', labelKey: 'sketch.colors.red', color: '#D64545' },
];

const SIZE_OPTIONS: Array<{ id: SizeId; labelKey: string }> = [
  { id: 's', labelKey: 'sketch.widths.s' },
  { id: 'm', labelKey: 'sketch.widths.m' },
  { id: 'l', labelKey: 'sketch.widths.l' },
];

function snapshotHasShapes(snapshot?: Snapshot) {
  return Object.values(snapshot?.document.store ?? {}).some((record) => record.typeName === 'shape');
}

function camerasMatch(left: Editor['camera'], right: Editor['camera']) {
  return (
    Math.abs(left.x - right.x) < 0.001 &&
    Math.abs(left.y - right.y) < 0.001 &&
    Math.abs(left.z - right.z) < 0.001
  );
}

export function SketchEditorModal({
  aspectRatio,
  initialSnapshot,
  onClose,
  onApply,
}: SketchEditorModalProps) {
  const { t } = useAppTranslation();
  const artboard = useMemo(() => getSketchArtboard(aspectRatio), [aspectRatio]);
  const numericRatio = getAspectRatioValue(aspectRatio);
  const cleanupEditorListenersRef = useRef<(() => void) | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [activeTool, setActiveTool] = useState<ToolId>('draw');
  const [activeColor, setActiveColor] = useState<ColorId>('black');
  const [activeSize, setActiveSize] = useState<SizeId>('m');
  const [history, setHistory] = useState({ canUndo: false, canRedo: false });
  const [hasContent, setHasContent] = useState(() => snapshotHasShapes(initialSnapshot));
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState<string>();

  const handleMount = useCallback((nextEditor: Editor) => {
    cleanupEditorListenersRef.current?.();
    setEditor(nextEditor);

    let syncingCamera = false;
    const syncCamera = () => {
      if (syncingCamera) return;
      const bounds = nextEditor.container.getBoundingClientRect();
      const nextCamera = getFixedArtboardCamera(
        { width: bounds.width, height: bounds.height },
        artboard
      );
      if (camerasMatch(nextEditor.camera, nextCamera)) return;

      syncingCamera = true;
      nextEditor.setCamera(nextCamera);
      syncingCamera = false;
    };
    const refreshDocumentState = () => {
      const nextHasContent = nextEditor.store.shapes().length > 0;
      setHasContent((current) => current === nextHasContent ? current : nextHasContent);
    };
    const refreshHistory = () => {
      setHistory({
        canUndo: nextEditor.store.canUndo,
        canRedo: nextEditor.store.canRedo,
      });
    };
    const refreshTool = () => setActiveTool(nextEditor.tool);
    const stopKeyboardPropagation = (event: KeyboardEvent) => event.stopPropagation();

    const stopStore = nextEditor.store.listen(refreshDocumentState);
    const stopHistory = nextEditor.store.listenHistory(refreshHistory);
    const stopTool = nextEditor.on('tool', refreshTool);
    const stopCamera = nextEditor.on('camera', syncCamera);
    const resizeObserver = new ResizeObserver(syncCamera);
    resizeObserver.observe(nextEditor.container);
    nextEditor.container.addEventListener('keydown', stopKeyboardPropagation);

    nextEditor.setTool('draw');
    nextEditor.setStyle('color', 'black');
    nextEditor.setStyle('size', 'm');
    refreshDocumentState();
    refreshHistory();
    syncCamera();

    cleanupEditorListenersRef.current = () => {
      stopStore();
      stopHistory();
      stopTool();
      stopCamera();
      resizeObserver.disconnect();
      nextEditor.container.removeEventListener('keydown', stopKeyboardPropagation);
    };
  }, [artboard]);

  useEffect(() => () => cleanupEditorListenersRef.current?.(), []);

  const chooseTool = (tool: ToolId) => {
    editor?.setTool(tool);
    setActiveTool(tool);
  };

  const chooseColor = (color: ColorId) => {
    editor?.setStyle('color', color);
    setActiveColor(color);
  };

  const chooseSize = (size: SizeId) => {
    editor?.setStyle('size', size);
    setActiveSize(size);
  };

  const handleApply = async () => {
    if (!editor || !hasContent || isApplying) return;
    setIsApplying(true);
    setError(undefined);
    try {
      await onApply({
        snapshot: editor.store.getSnapshot(),
        image: exportFixedArtboardPng(editor, aspectRatio),
        aspectRatio,
      });
    } catch (applyError) {
      setError(applyError instanceof Error ? applyError.message : t('sketch.saveFailed'));
    } finally {
      setIsApplying(false);
    }
  };

  const frameSizeClass = numericRatio >= 1.5
    ? 'w-full max-w-6xl'
    : 'h-[68vh] max-h-full max-w-full';

  const content = (
    <div
      data-sketch-editor-modal="true"
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-[#16130F]/95 p-3 backdrop-blur-md sm:p-5"
      onKeyDown={(event) => event.stopPropagation()}
      onKeyUp={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={t('sketch.editorAria')}
        className="grid max-h-[96vh] w-full max-w-7xl grid-rows-[auto_auto_minmax(0,1fr)_auto] overflow-hidden rounded-3xl border shadow-2xl"
        style={{ background: '#1D1A14', borderColor: 'rgba(242,193,78,0.22)' }}
      >
        <header className="flex items-center justify-between gap-4 border-b px-5 py-4" style={{ borderColor: 'rgba(242,193,78,0.12)' }}>
          <div>
            <h2 className="text-lg font-bold" style={{ color: '#EEE4CE' }}>{t('sketch.title')}</h2>
            <p className="mt-1 text-xs" style={{ color: '#96836F' }}>
              {t('sketch.aspectDescription', { aspectRatio })}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl p-2 text-red-300 hover:bg-red-900/30" title={t('sketch.close')}>
            <X size={20} />
          </button>
        </header>

        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3" style={{ borderColor: 'rgba(242,193,78,0.1)', background: '#141210' }}>
          {TOOL_OPTIONS.map(({ id, labelKey, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => chooseTool(id)}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium"
              style={activeTool === id
                ? { background: '#F2C14E', color: '#16130F' }
                : { background: '#1D1A14', color: '#EEE4CE' }}
              title={t(labelKey)}
            >
              <Icon size={15} />
              {t(labelKey)}
            </button>
          ))}

          <span className="mx-1 h-6 w-px" style={{ background: 'rgba(242,193,78,0.15)' }} />
          {COLOR_OPTIONS.map(({ id, labelKey, color }) => (
            <button
              key={id}
              type="button"
              onClick={() => chooseColor(id)}
              className="h-7 w-7 rounded-full border-2"
              style={{
                background: color,
                borderColor: activeColor === id ? '#F2C14E' : 'rgba(238,228,206,0.25)',
                boxShadow: activeColor === id ? '0 0 0 2px #16130F, 0 0 0 3px #F2C14E' : undefined,
              }}
              aria-label={t(labelKey)}
              title={t(labelKey)}
            />
          ))}

          <span className="mx-1 h-6 w-px" style={{ background: 'rgba(242,193,78,0.15)' }} />
          {SIZE_OPTIONS.map(({ id, labelKey }) => (
            <button
              key={id}
              type="button"
              onClick={() => chooseSize(id)}
              className="rounded-lg px-2.5 py-1.5 text-xs"
              style={activeSize === id
                ? { background: 'rgba(242,193,78,0.18)', color: '#F2C14E' }
                : { color: '#96836F' }}
            >
              {t(labelKey)}
            </button>
          ))}

          <span className="mx-1 h-6 w-px" style={{ background: 'rgba(242,193,78,0.15)' }} />
          <button
            type="button"
            disabled={!history.canUndo}
            onClick={() => editor?.store.undo()}
            className="rounded-lg p-2 disabled:opacity-30"
            style={{ color: '#EEE4CE' }}
            title={t('common.undo')}
          >
            <Undo2 size={16} />
          </button>
          <button
            type="button"
            disabled={!history.canRedo}
            onClick={() => editor?.store.redo()}
            className="rounded-lg p-2 disabled:opacity-30"
            style={{ color: '#EEE4CE' }}
            title={t('common.redo')}
          >
            <Redo2 size={16} />
          </button>
          <button
            type="button"
            disabled={!hasContent}
            onClick={() => editor?.clearBoard()}
            className="rounded-lg p-2 text-red-300 disabled:opacity-30"
            title={t('sketch.clearUndoable')}
          >
            <Trash2 size={16} />
          </button>
        </div>

        <div className="flex min-h-0 items-center justify-center overflow-auto bg-[#0F0D0A] p-4 sm:p-6">
          <div
            className={`relative shrink-0 overflow-hidden rounded-xl border-2 shadow-2xl ${frameSizeClass}`}
            style={{
              aspectRatio: `${artboard.width} / ${artboard.height}`,
              borderColor: 'rgba(242,193,78,0.55)',
              background: '#fbf9f4',
              boxShadow: '0 18px 50px rgba(0,0,0,0.45)',
            }}
            aria-label={t('sketch.canvasAria', { aspectRatio })}
          >
            <Quickdraw
              snapshot={initialSnapshot}
              theme="light"
              grid="none"
              hideUi
              themeToggle={false}
              gridControl={false}
              watermark={false}
              styles={{ color: 'black', size: 'm', dash: 'draw', fill: 'none', font: 'draw' }}
              onMount={handleMount}
            />
          </div>
        </div>

        <footer className="flex flex-col gap-3 border-t px-5 py-4 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: 'rgba(242,193,78,0.12)' }}>
          <div>
            <p className="text-xs leading-5" style={{ color: '#96836F' }}>
              {t('sketch.hint')}
            </p>
            {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
          </div>
          <button
            type="button"
            data-sketch-action="apply"
            disabled={!editor || !hasContent || isApplying}
            onClick={handleApply}
            className="inline-flex min-w-36 items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-40"
            style={{ background: '#F2C14E', color: '#16130F' }}
          >
            {isApplying ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            {t('sketch.apply')}
          </button>
        </footer>
      </section>
    </div>
  );

  if (typeof document === 'undefined') return content;
  return createPortal(content, document.body);
}
