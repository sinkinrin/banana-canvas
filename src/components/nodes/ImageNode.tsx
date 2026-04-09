import { Handle, Position, NodeProps } from '@xyflow/react';
import { Download, Maximize2, Trash2, Copy, Check, RefreshCw, Wand2 } from 'lucide-react';
import React, { useState } from 'react';
import { ImageViewer } from '../ImageViewer';
import { useStore } from '../../store';
import type { AppNode } from '../../store';
import { generateImage } from '../../services/gemini';

export function ImageNode({ id, data }: NodeProps<AppNode>) {
  const [isHovered, setIsHovered] = useState(false);
  const [showViewer, setShowViewer] = useState(false);
  const [copiedImage, setCopiedImage] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const deleteNode = useStore((state) => state.deleteNode);
  const addNode = useStore((state) => state.addNode);
  const updateNodeData = useStore((state) => state.updateNodeData);
  const nodes = useStore((state) => state.nodes);

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    deleteNode(id);
  };

  const handleDownload = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!data.imageUrl) return;
    const a = document.createElement('a');
    a.href = data.imageUrl;
    a.download = `banana-art-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleCopyImage = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const response = await fetch(data.imageUrl);
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
    setIsRegenerating(true);
    try {
      const newUrl = await generateImage({
        prompt: data.prompt,
        aspectRatio: (data.aspectRatio as any) || '1:1',
        imageSize: (data.imageSize as any) || '1K',
      });
      updateNodeData(id, { imageUrl: newUrl });
    } catch (err) {
      console.error('Rerun failed:', err);
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleUseAsReference = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!data.imageUrl) return;
    const match = data.imageUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);
    if (!match) return;
    const thisNode = nodes.find(n => n.id === id);
    const pos = thisNode?.position || { x: 0, y: 0 };
    addNode('promptNode',
      { x: pos.x + 50, y: pos.y + 300 },
      {
        prompt: '',
        referenceImages: [{ mimeType: match[1], data: match[2], url: data.imageUrl }],
      }
    );
  };

  return (
    <div
      className="bg-white p-2 rounded-2xl shadow-xl border border-gray-200 group transition-all hover:shadow-2xl"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onDoubleClick={() => setShowViewer(true)}
    >
      <Handle type="target" position={Position.Left} className="w-3 h-3 bg-purple-500 border-2 border-white opacity-0 group-hover:opacity-100 transition-opacity" />

      <div className="relative rounded-xl overflow-hidden bg-gray-50 min-w-[256px] min-h-[256px] flex items-center justify-center cursor-zoom-in">
        {data.imageUrl ? (
          <>
            <img
              src={data.imageUrl}
              alt={data.prompt || 'Generated image'}
              className="max-w-[512px] max-h-[512px] object-contain"
            />

            {/* Hover overlay controls */}
            <div className={`absolute inset-0 bg-black/5 flex items-center justify-center transition-opacity duration-200 ${isHovered ? 'opacity-100' : 'opacity-0'}`}>
              <div className="flex items-center gap-2 bg-gray-900/60 backdrop-blur-md p-2 rounded-2xl border border-white/10 shadow-2xl">
                <button
                  onClick={handleCopyImage}
                  className="p-2.5 text-white hover:bg-white/20 rounded-xl transition-all"
                  title="复制图片"
                >
                  {copiedImage ? <Check size={18} className="text-green-400" /> : <Copy size={18} />}
                </button>
                <button
                  onClick={handleDownload}
                  className="p-2.5 text-white hover:bg-white/20 rounded-xl transition-all"
                  title="下载"
                >
                  <Download size={18} />
                </button>
                <button
                  className="p-2.5 text-white hover:bg-white/20 rounded-xl transition-all"
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
                  className="p-2.5 text-white hover:bg-white/20 rounded-xl transition-all"
                  title="重新生成"
                  disabled={isRegenerating}
                >
                  <RefreshCw size={18} className={isRegenerating ? 'animate-spin' : ''} />
                </button>
                <button
                  onClick={handleUseAsReference}
                  className="p-2.5 text-white hover:bg-white/20 rounded-xl transition-all"
                  title="以此为参考新建节点"
                >
                  <Wand2 size={18} />
                </button>
                <button
                  onClick={handleDelete}
                  className="p-2.5 text-white hover:bg-red-500/40 rounded-xl transition-all"
                  title="删除"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="text-gray-400 text-sm">无图像数据</div>
        )}
      </div>

      {data.prompt && (
        <div className="mt-3 px-2 pb-1 max-w-[512px] flex items-start justify-between gap-2">
          <p className="text-xs text-gray-500 line-clamp-2 flex-1 leading-relaxed" title={data.prompt}>
            {data.prompt}
          </p>
          <button
            onClick={handleCopyPrompt}
            className="p-1.5 bg-gray-900/80 text-white/80 hover:text-white hover:bg-gray-800 rounded-lg transition-all shrink-0 border border-white/10 shadow-sm"
            title="复制提示词"
          >
            {copiedPrompt ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
          </button>
        </div>
      )}

      <Handle type="source" position={Position.Right} className="w-3 h-3 bg-blue-500 border-2 border-white opacity-0 group-hover:opacity-100 transition-opacity" />

      {showViewer && data.imageUrl && (
        <ImageViewer
          imageUrl={data.imageUrl}
          prompt={data.prompt}
          onClose={() => setShowViewer(false)}
        />
      )}
    </div>
  );
}
