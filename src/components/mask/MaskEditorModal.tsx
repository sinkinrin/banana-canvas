import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import i18n, { useAppTranslation } from '../../i18n';
import { Brush, Eraser, Loader2, RotateCcw, Undo2, X } from 'lucide-react';

import type { InlineImageData } from '../../lib/canvasState';
import { createOpenAiEditMaskPixels } from '../../lib/maskExport';

export type MaskGeneratePayload = {
  prompt: string;
  maskImage: { data: string; mimeType: 'image/png' };
  sourceImage: InlineImageData;
};

type MaskEditorModalProps = {
  title: string;
  sourceImage: InlineImageData;
  initialPrompt?: string;
  onClose: () => void;
  onGenerate: (payload: MaskGeneratePayload) => Promise<void>;
};

type MaskTool = 'brush' | 'eraser';
type DrawPhase = 'move' | 'stop';

const MAX_UNDO_FRAMES = 10;
const UNDO_MEMORY_BUDGET_BYTES = 32 * 1024 * 1024;

export function getMaskUndoFrameLimit(
  width: number,
  height: number,
  memoryBudgetBytes = UNDO_MEMORY_BUDGET_BYTES
) {
  const frameBytes = width * height * 4;
  if (frameBytes <= 0) return MAX_UNDO_FRAMES;
  return Math.max(1, Math.min(MAX_UNDO_FRAMES, Math.floor(memoryBudgetBytes / frameBytes)));
}

export function shouldScanMaskAfterDraw(tool: MaskTool, phase: DrawPhase) {
  return tool === 'eraser' && phase === 'stop';
}

function dataUrlToImageInput(dataUrl: string): { data: string; mimeType: 'image/png' } {
  const match = dataUrl.match(/^data:(image\/png);base64,(.+)$/);
  if (!match) {
    throw new Error(i18n.t('mask.exportFailed'));
  }
  return { mimeType: 'image/png', data: match[2] };
}

function dataUrlToInlinePng(dataUrl: string): InlineImageData {
  const image = dataUrlToImageInput(dataUrl);
  return { ...image, url: dataUrl };
}

export function MaskEditorModal({
  title,
  sourceImage,
  initialPrompt = '',
  onClose,
  onGenerate,
}: MaskEditorModalProps) {
  const { t } = useAppTranslation();
  const imageRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const undoStackRef = useRef<ImageData[]>([]);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  const [prompt, setPrompt] = useState(initialPrompt);
  const [tool, setTool] = useState<MaskTool>('brush');
  const [brushSize, setBrushSize] = useState(36);
  const [hasMask, setHasMask] = useState(false);
  const [undoCount, setUndoCount] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string>();

  const updateHasMask = () => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context || canvas.width === 0 || canvas.height === 0) {
      setHasMask(false);
      return;
    }
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let index = 3; index < data.length; index += 4) {
      if (data[index] > 0) {
        setHasMask(true);
        return;
      }
    }
    setHasMask(false);
  };

  const pushUndo = () => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context || canvas.width === 0 || canvas.height === 0) return;
    const frameLimit = getMaskUndoFrameLimit(canvas.width, canvas.height);
    const retainedFrames = frameLimit > 1 ? undoStackRef.current.slice(-(frameLimit - 1)) : [];
    undoStackRef.current = [
      ...retainedFrames,
      context.getImageData(0, 0, canvas.width, canvas.height),
    ];
    setUndoCount(undoStackRef.current.length);
  };

  const pointFromEvent = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const drawTo = (point: { x: number; y: number }) => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    const previous = lastPointRef.current ?? point;
    context.save();
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.lineWidth = brushSize;
    context.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
    context.strokeStyle = 'rgba(242,193,78,1)';
    context.beginPath();
    context.moveTo(previous.x, previous.y);
    context.lineTo(point.x, point.y);
    context.stroke();
    context.restore();
    lastPointRef.current = point;
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    const point = pointFromEvent(event);
    if (!point) return;
    pushUndo();
    drawingRef.current = true;
    lastPointRef.current = point;
    event.currentTarget.setPointerCapture(event.pointerId);
    drawTo(point);
    if (tool === 'brush') setHasMask(true);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const point = pointFromEvent(event);
    if (!point) return;
    drawTo(point);
    if (tool === 'brush') setHasMask(true);
  };

  const stopDrawing = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    drawingRef.current = false;
    lastPointRef.current = null;
    if (shouldScanMaskAfterDraw(tool, 'stop')) updateHasMask();
  };

  const handleUndo = () => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    const previous = undoStackRef.current.pop();
    if (!canvas || !context || !previous) return;
    context.putImageData(previous, 0, 0);
    setUndoCount(undoStackRef.current.length);
    updateHasMask();
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    pushUndo();
    context.clearRect(0, 0, canvas.width, canvas.height);
    setHasMask(false);
  };

  const exportMask = () => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context || canvas.width === 0 || canvas.height === 0) {
      throw new Error(t('mask.canvasNotReady'));
    }
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = canvas.width;
    maskCanvas.height = canvas.height;
    const maskContext = maskCanvas.getContext('2d');
    if (!maskContext) throw new Error(t('mask.exportCanvasFailed'));

    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    imageData.data.set(createOpenAiEditMaskPixels(imageData.data));
    maskContext.putImageData(imageData, 0, 0);
    return dataUrlToImageInput(maskCanvas.toDataURL('image/png'));
  };

  const exportSourceImage = () => {
    const image = imageRef.current;
    if (!image || !image.naturalWidth || !image.naturalHeight) {
      throw new Error(t('mask.sourceNotReady'));
    }

    const sourceCanvas = document.createElement('canvas');
    sourceCanvas.width = image.naturalWidth;
    sourceCanvas.height = image.naturalHeight;
    const sourceContext = sourceCanvas.getContext('2d');
    if (!sourceContext) throw new Error(t('mask.sourceCanvasFailed'));
    sourceContext.drawImage(image, 0, 0, sourceCanvas.width, sourceCanvas.height);
    return dataUrlToInlinePng(sourceCanvas.toDataURL('image/png'));
  };

  const handleGenerate = async () => {
    if (!prompt.trim() || !hasMask || isGenerating) return;
    setIsGenerating(true);
    setError(undefined);
    try {
      await onGenerate({
        prompt: prompt.trim(),
        maskImage: exportMask(),
        sourceImage: exportSourceImage(),
      });
    } catch (error) {
      setError(error instanceof Error ? error.message : t('promptNode.errors.maskGeneration'));
    } finally {
      setIsGenerating(false);
    }
  };

  useEffect(() => {
    const image = imageRef.current;
    const canvas = canvasRef.current;
    if (!image || !canvas) return;

    const syncCanvasSize = () => {
      const width = image.naturalWidth || 1024;
      const height = image.naturalHeight || 1024;
      canvas.width = width;
      canvas.height = height;
      undoStackRef.current = [];
      setUndoCount(0);
      setHasMask(false);
    };

    if (image.complete) {
      syncCanvasSize();
      return;
    }

    image.addEventListener('load', syncCanvasSize);
    return () => image.removeEventListener('load', syncCanvasSize);
  }, [sourceImage.url]);

  const canGenerate = Boolean(prompt.trim()) && hasMask && !isGenerating;

  const content = (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-[#16130F]/95 p-4 backdrop-blur-md">
      <section
        className="grid max-h-[94vh] w-full max-w-6xl grid-rows-[auto_1fr] overflow-hidden rounded-3xl border shadow-2xl"
        style={{ background: '#1D1A14', borderColor: 'rgba(242,193,78,0.22)' }}
      >
        <div className="flex items-center justify-between gap-4 border-b px-5 py-4" style={{ borderColor: 'rgba(242,193,78,0.12)' }}>
          <div>
            <h2 className="text-lg font-bold" style={{ color: '#EEE4CE' }}>{title}</h2>
            <p className="mt-1 text-xs" style={{ color: '#96836F' }}>
              {t('mask.description')}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl p-2 text-red-300 hover:bg-red-900/30" title={t('common.close')}>
            <X size={20} />
          </button>
        </div>

        <div className="grid min-h-0 gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="flex min-h-0 items-center justify-center overflow-hidden rounded-2xl border" style={{ background: '#0F0D0A', borderColor: 'rgba(242,193,78,0.14)' }}>
            <div className="relative max-h-full max-w-full">
              <img
                ref={imageRef}
                src={sourceImage.url}
                alt={t('mask.sourceAlt')}
                className="max-h-[70vh] max-w-full select-none rounded-xl object-contain"
                draggable={false}
              />
              <canvas
                ref={canvasRef}
                className="absolute inset-0 h-full w-full touch-none rounded-xl"
                style={{ opacity: 0.62 }}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={stopDrawing}
                onPointerCancel={stopDrawing}
                aria-label={t('mask.canvasAria')}
              />
            </div>
          </div>

          <aside className="space-y-4 overflow-y-auto rounded-2xl border p-4" style={{ background: '#141210', borderColor: 'rgba(242,193,78,0.12)' }}>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setTool('brush')}
                className="inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium"
                style={tool === 'brush' ? { background: '#F2C14E', color: '#16130F' } : { background: '#1D1A14', color: '#EEE4CE' }}
              >
                <Brush size={16} />
                {t('mask.brush')}
              </button>
              <button
                type="button"
                onClick={() => setTool('eraser')}
                className="inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium"
                style={tool === 'eraser' ? { background: '#F2C14E', color: '#16130F' } : { background: '#1D1A14', color: '#EEE4CE' }}
              >
                <Eraser size={16} />
                {t('mask.eraser')}
              </button>
            </div>

            <label className="block space-y-2 text-xs font-medium uppercase tracking-wider" style={{ color: '#96836F' }}>
              {t('mask.brushSize', { size: brushSize })}
              <input
                type="range"
                min={8}
                max={160}
                value={brushSize}
                onChange={(event) => setBrushSize(Number(event.target.value))}
                className="w-full accent-[#F2C14E]"
              />
            </label>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleUndo}
                disabled={undoCount === 0}
                className="inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm disabled:opacity-40"
                style={{ background: '#1D1A14', color: '#EEE4CE' }}
              >
                <Undo2 size={16} />
                {t('common.undo')}
              </button>
              <button
                type="button"
                onClick={handleClear}
                disabled={!hasMask}
                className="inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm disabled:opacity-40"
                style={{ background: '#1D1A14', color: '#EEE4CE' }}
              >
                <RotateCcw size={16} />
                {t('common.clear')}
              </button>
            </div>

            <label className="block space-y-2 text-xs font-medium uppercase tracking-wider" style={{ color: '#96836F' }}>
              {t('mask.promptLabel')}
              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder={t('mask.promptPlaceholder')}
                className="nowheel min-h-28 w-full resize-none rounded-xl p-3 text-sm outline-none"
                style={{ background: '#1D1A14', border: '1px solid rgba(242,193,78,0.2)', color: '#EEE4CE' }}
              />
            </label>

            {!hasMask && (
              <p className="text-xs leading-5" style={{ color: '#5C4E3E' }}>
                {t('mask.paintFirst')}
              </p>
            )}
            {error && (
              <p className="rounded-xl border p-3 text-xs" style={{ borderColor: 'rgba(239,68,68,0.25)', color: '#F87171', background: 'rgba(239,68,68,0.08)' }}>
                {error}
              </p>
            )}

            <button
              type="button"
              disabled={!canGenerate}
              onClick={handleGenerate}
              className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-45"
              style={{ background: '#F2C14E', color: '#16130F' }}
            >
              {isGenerating && <Loader2 size={16} className="animate-spin" />}
              {t('mask.generate')}
            </button>
          </aside>
        </div>
      </section>
    </div>
  );

  if (typeof document === 'undefined') return content;
  return createPortal(content, document.body);
}
