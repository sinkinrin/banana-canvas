import { Handle, Position, NodeProps } from '@xyflow/react';
import { Download, Maximize2, Trash2, Copy, Check, RefreshCw, Wand2 } from 'lucide-react';
import React, { useState, useRef, useEffect } from 'react';
import { AnimatePresence } from 'motion/react';
import { ImageViewer } from '../ImageViewer';
import { useStore } from '../../store';
import type { AppNode } from '../../store';
import { createReferenceImagePayload, resolveImageUrl } from '../../lib/canvasState';
import { generateImage } from '../../services/gemini';

export function ImageNode({ id, data }: NodeProps<AppNode>) {
  const [isHovered, setIsHovered] = useState(false);
  const [showViewer, setShowViewer] = useState(false);
  const [copiedImage, setCopiedImage] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const rerunAbortRef = useRef<AbortController | null>(null);
  const deleteNode = useStore((state) => state.deleteNode);
  const addNode = useStore((state) => state.addNode);
  const assets = useStore((state) => state.assets);
  const updateNodeData = useStore((state) => state.updateNodeData);
  const imageUrl = resolveImageUrl(data, assets);

  useEffect(() => {
    return () => {
      rerunAbortRef.current?.abort();
    };
  }, []);

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    deleteNode(id);
  };

  const handleDownload = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!imageUrl) return;
    const a = document.createElement('a');
    a.href = imageUrl;
    a.download = `banana-art-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleCopyImage = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!imageUrl) return;
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type]: blob })
      ]);
      setCopiedImage(true);
      setTimeout(() => setCopiedImage(false), 2000);
    } catch (err) {
      console.error('Failed to copy image:', err);
    }
  };

  const handleCopyPrompt = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(data.prompt || '');
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2000);
  };

  const handleRerun = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!data.prompt || isRegenerating) return;

    const controller = new AbortController();
    rerunAbortRef.current = controller;
    setIsRegenerating(true);

    try {
      const newUrl = await generateImage({
        prompt: data.prompt,
        aspectRatio: data.aspectRatio || '1:1',
        imageSize: data.imageSize || '1K',
        signal: controller.signal,
      });
      // Only update if not aborted
      if (!controller.signal.aborted) {
        updateNodeData(id, { imageUrl: newUrl, imageAssetId: undefined });
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        console.error('Rerun failed:', err);
      }
    } finally {
      rerunAbortRef.current = null;
      setIsRegenerating(false);
    }
  };

  const handleUseAsReference = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!imageUrl) return;
    const referencePayload = createReferenceImagePayload(imageUrl, data.imageAssetId);
    if (!referencePayload) return;
    const thisNode = useStore.getState().nodes.find((n) => n.id === id);
    const pos = thisNode?.position || { x: 0, y: 0 };
    const newNodeId = addNode('promptNode',
      { x: pos.x + 50, y: pos.y + 300 },
      {
        prompt: '',
        ...referencePayload,
      }
    );
    useStore.setState((state) => ({
      edges: [...state.edges, {
        id: `e-${id}-${newNodeId}`,
        source: id,
        target: newNodeId,
      }],
    }));
  };

  return (
    <div
      className="rounded-2xl overflow-hidden transition-all group"
      style={{
        background: '#1D1A14',
        border: '1px solid rgba(242,193,78,0.15)',
        boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
        padding: '6px',
      }}
      onMouseEnter={e => {
        setIsHovered(true);
        (e.currentTarget as HTMLElement).style.boxShadow = '0 8px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(242,193,78,0.35)';
      }}
      onMouseLeave={e => {
        setIsHovered(false);
        (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 20px rgba(0,0,0,0.5)';
      }}
      onDoubleClick={() => setShowViewer(true)}
    >
      <Handle type="target" position={Position.Left} className="w-3 h-3 border-2 opacity-0 group-hover:opacity-100 transition-opacity" style={{background: '#9B70D0', borderColor: '#1D1A14'}} />

      <div className="relative min-w-[256px] min-h-[256px] flex items-center justify-center cursor-zoom-in" style={{background: '#141210', borderRadius: '10px', overflow: 'hidden'}}>
        {imageUrl ? (
          <>
            <img
              src={imageUrl}
              alt={data.prompt || 'Generated image'}
              className="max-w-[512px] max-h-[512px] object-contain"
            />

            {/* Hover overlay controls */}
            <div className={`absolute inset-0 bg-black/5 flex items-center justify-center transition-opacity duration-200 ${isHovered ? 'opacity-100' : 'opacity-0'}`}>
              <div className="flex items-center gap-2 p-2 rounded-2xl shadow-2xl" style={{background: 'rgba(22,19,15,0.85)', border: '1px solid rgba(242,193,78,0.2)', backdropFilter: 'blur(8px)'}}>
                <button
                  onClick={handleCopyImage}
                  className="p-2.5 text-white hover:bg-[rgba(242,193,78,0.12)] rounded-xl transition-all"
                  title="复制图片"
                >
                  {copiedImage ? <Check size={18} className="text-green-400" /> : <Copy size={18} />}
                </button>
                <button
                  onClick={handleDownload}
                  className="p-2.5 text-white hover:bg-[rgba(242,193,78,0.12)] rounded-xl transition-all"
                  title="下载"
                >
                  <Download size={18} />
                </button>
                <button
                  className="p-2.5 text-white hover:bg-[rgba(242,193,78,0.12)] rounded-xl transition-all"
                  title="全屏查看"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowViewer(true);
                  }}
                >
                  <Maximize2 size={18} />
                </button>
                <button
                  onClick={handleRerun}
                  className="p-2.5 text-white hover:bg-[rgba(242,193,78,0.12)] rounded-xl transition-all"
                  title="重新生成"
                  disabled={isRegenerating}
                >
                  <RefreshCw size={18} className={isRegenerating ? 'animate-spin' : ''} />
                </button>
                <button
                  onClick={handleUseAsReference}
                  className="p-2.5 text-white hover:bg-[rgba(242,193,78,0.12)] rounded-xl transition-all"
                  title="以此为参考新建节点"
                >
                  <Wand2 size={18} />
                </button>
                <button
                  onClick={handleDelete}
                  className="p-2.5 text-white hover:bg-[rgba(239,68,68,0.15)] rounded-xl transition-all"
                  title="删除"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="text-sm" style={{color: '#5C4E3E'}}>无图像数据</div>
        )}
      </div>

      {data.prompt && (
        <div className="mt-3 px-2 pb-1 max-w-[512px] flex items-start justify-between gap-2">
          <p className="text-xs line-clamp-2 flex-1 leading-relaxed" style={{color: '#5C4E3E'}} title={data.prompt}>
            {data.prompt}
          </p>
          <button
            onClick={handleCopyPrompt}
            className="p-1.5 rounded-lg transition-all shrink-0 shadow-sm"
            style={{background: 'rgba(22,19,15,0.8)', border: '1px solid rgba(242,193,78,0.15)', color: '#96836F'}}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#F2C14E'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(242,193,78,0.35)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#96836F'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(242,193,78,0.15)'; }}
            title="复制提示词"
          >
            {copiedPrompt ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
          </button>
        </div>
      )}

      <Handle type="source" position={Position.Right} className="w-3 h-3 border-2 opacity-0 group-hover:opacity-100 transition-opacity" style={{background: '#5B9BD5', borderColor: '#1D1A14'}} />

      <AnimatePresence>
        {showViewer && imageUrl && (
          <ImageViewer
            imageUrl={imageUrl}
            prompt={data.prompt}
            onClose={() => setShowViewer(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
