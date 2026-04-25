import { Handle, Position, NodeProps } from '@xyflow/react';
import { Download, Maximize2, Trash2, Copy, Check, RefreshCw, Wand2, Edit3, GitCompare } from 'lucide-react';
import React, { useState, useRef, useEffect } from 'react';
import { AnimatePresence } from 'motion/react';
import { ImageViewer } from '../ImageViewer';
import { useStore } from '../../store';
import type { AppNode } from '../../store';
import {
  createReferenceImagePayload,
  imageAssetFromDataUrl,
  resolveImageUrl,
  resolveReferenceImages,
  resolveSourceImageUrl,
  type CanvasImageAsset,
  type InlineImageData,
} from '../../lib/canvasState';
import { generateImage } from '../../services/gemini';
import { getImageModelConfig, normalizeImageModel } from '../../lib/imageModels';
import { GeneratingImagePlaceholder } from './GeneratingImagePlaceholder';
import { MaskEditorModal, type MaskGeneratePayload } from '../mask/MaskEditorModal';
import { MaskCompareModal } from '../mask/MaskCompareModal';

export function canRerunImageNode(data: AppNode['data']) {
  return Boolean(data.prompt) && data.generationMode !== 'mask-edit';
}

export function getRerunReferenceImages(
  data: AppNode['data'],
  assets: Record<string, CanvasImageAsset>
) {
  const referenceImages = resolveReferenceImages(data, assets);
  return referenceImages.length > 0
    ? referenceImages.map((image) => ({ data: image.data, mimeType: image.mimeType }))
    : undefined;
}

export function ImageNode({ id, data }: NodeProps<AppNode>) {
  const [isHovered, setIsHovered] = useState(false);
  const [showViewer, setShowViewer] = useState(false);
  const [copiedImage, setCopiedImage] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [showMaskEditor, setShowMaskEditor] = useState(false);
  const [showCompare, setShowCompare] = useState(false);
  const rerunAbortRef = useRef<AbortController | null>(null);
  const deleteNode = useStore((state) => state.deleteNode);
  const addNode = useStore((state) => state.addNode);
  const assets = useStore((state) => state.assets);
  const updateNodeData = useStore((state) => state.updateNodeData);
  const imageUrl = resolveImageUrl(data, assets);
  const sourceImageUrl = resolveSourceImageUrl(data, assets);
  const imageModel = normalizeImageModel(data.imageModel);
  const imageModelLabel = getImageModelConfig(imageModel).label;
  const generationTitle = data.generationTitle || `${imageModelLabel} | ${data.prompt?.slice(0, 24) || '生成任务'}`;
  const canRerun = canRerunImageNode(data);

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
    const prompt = data.prompt;
    if (!prompt || !canRerun || isRegenerating) return;

    const controller = new AbortController();
    rerunAbortRef.current = controller;
    setIsRegenerating(true);

    try {
      const newUrl = await generateImage({
        prompt,
        imageModel,
        aspectRatio: data.aspectRatio || '1:1',
        imageSize: data.imageSize || '1K',
        bananaOptions: imageModel === 'banana' ? data.bananaOptions : undefined,
        image2Options: imageModel === 'image2' ? data.image2Options : undefined,
        referenceImages: getRerunReferenceImages(data, assets),
        signal: controller.signal,
      });
      // Only update if not aborted
      if (!controller.signal.aborted) {
        updateNodeData(id, {
          imageUrl: newUrl,
          imageAssetId: undefined,
          imageModel,
          bananaOptions: imageModel === 'banana' ? data.bananaOptions : undefined,
          image2Options: imageModel === 'image2' ? data.image2Options : undefined,
        });
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

  const getInlineImage = (): InlineImageData | null => {
    if (data.imageAssetId && assets[data.imageAssetId]) {
      const asset = assets[data.imageAssetId];
      return {
        data: asset.data,
        mimeType: asset.mimeType,
        url: `data:${asset.mimeType};base64,${asset.data}`,
      };
    }

    if (!imageUrl) return null;
    const asset = imageAssetFromDataUrl(imageUrl);
    return asset ? { data: asset.data, mimeType: asset.mimeType, url: imageUrl } : null;
  };

  const createReferenceNode = () => {
    if (!imageUrl) return;
    const referencePayload = createReferenceImagePayload(imageUrl, data.imageAssetId);
    if (!referencePayload) return;
    const thisNode = useStore.getState().nodes.find((n) => n.id === id);
    const pos = thisNode?.position || { x: 0, y: 0 };
    const newNodeId = addNode('promptNode',
      { x: pos.x + 50, y: pos.y + 300 },
      {
        prompt: '',
        imageModel,
        bananaOptions: imageModel === 'banana' ? data.bananaOptions : undefined,
        image2Options: imageModel === 'image2' ? data.image2Options : undefined,
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

  const handleUseAsReference = (e: React.MouseEvent) => {
    e.stopPropagation();
    createReferenceNode();
  };

  const handleMaskGenerate = async ({ prompt: maskPrompt, maskImage, sourceImage }: MaskGeneratePayload) => {
    const thisNode = useStore.getState().nodes.find((n) => n.id === id);
    const pos = thisNode?.position || { x: 0, y: 0 };
    const createdAt = new Date().toISOString();
    const placeholderNodeId = addNode(
      'imageNode',
      { x: pos.x + 430, y: pos.y },
      {
        prompt: maskPrompt,
        imageModel: 'image2',
        aspectRatio: data.aspectRatio || '1:1',
        imageSize: data.imageSize || '1K',
        image2Options: data.image2Options,
        sourceImage,
        sourcePrompt: maskPrompt,
        generationMode: 'mask-edit',
        isLoading: true,
        error: undefined,
        createdAt,
        generationTitle: `Image2 局部编辑 | ${maskPrompt.slice(0, 28) || '生成任务'}`,
      }
    );

    useStore.setState((state) => ({
      edges: [
        ...state.edges,
        {
          id: `e-${id}-${placeholderNodeId}`,
          source: id,
          target: placeholderNodeId,
        },
      ],
    }));

    try {
      const url = await generateImage({
        prompt: maskPrompt,
        imageModel: 'image2',
        aspectRatio: data.aspectRatio || '1:1',
        imageSize: data.imageSize || '1K',
        image2Options: data.image2Options,
        referenceImages: [{ data: sourceImage.data, mimeType: sourceImage.mimeType }],
        maskImage,
      });

      updateNodeData(placeholderNodeId, {
        imageUrl: url,
        prompt: maskPrompt,
        imageModel: 'image2',
        aspectRatio: data.aspectRatio || '1:1',
        imageSize: data.imageSize || '1K',
        image2Options: data.image2Options,
        sourceImage,
        sourcePrompt: maskPrompt,
        generationMode: 'mask-edit',
        isLoading: false,
        error: undefined,
      });
      setShowMaskEditor(false);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '局部编辑生成失败';
      updateNodeData(placeholderNodeId, {
        isLoading: false,
        error: errorMessage,
      });
      throw error;
    }
  };

  if (!imageUrl && (data.isLoading || data.error)) {
    return (
      <div className="relative group">
        <Handle type="target" position={Position.Left} className="w-3 h-3 border-2 opacity-0 group-hover:opacity-100 transition-opacity" style={{background: '#9B70D0', borderColor: '#ffffff'}} />
        <GeneratingImagePlaceholder
          modelLabel={imageModelLabel}
          title={generationTitle}
          prompt={data.prompt}
          createdAt={data.createdAt}
          error={data.error}
        />
        <Handle type="source" position={Position.Right} className="w-3 h-3 border-2 opacity-0 group-hover:opacity-100 transition-opacity" style={{background: '#5B9BD5', borderColor: '#ffffff'}} />
      </div>
    );
  }

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
                {canRerun && (
                  <button
                    onClick={handleRerun}
                    className="p-2.5 text-white hover:bg-[rgba(242,193,78,0.12)] rounded-xl transition-all"
                    title="重新生成"
                    disabled={isRegenerating}
                  >
                    <RefreshCw size={18} className={isRegenerating ? 'animate-spin' : ''} />
                  </button>
                )}
                <button
                  onClick={handleUseAsReference}
                  className="p-2.5 text-white hover:bg-[rgba(242,193,78,0.12)] rounded-xl transition-all"
                  title="以此为参考新建节点"
                >
                  <Wand2 size={18} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowMaskEditor(true);
                  }}
                  className="p-2.5 text-white hover:bg-[rgba(242,193,78,0.12)] rounded-xl transition-all"
                  title="局部编辑"
                >
                  <Edit3 size={18} />
                </button>
                {sourceImageUrl && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowCompare(true);
                    }}
                    className="p-2.5 text-white hover:bg-[rgba(242,193,78,0.12)] rounded-xl transition-all"
                    title="对比原图和新图"
                  >
                    <GitCompare size={18} />
                  </button>
                )}
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
          <div className="flex-1">
            <div className="mb-1 inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium" style={{background: 'rgba(242,193,78,0.08)', color: '#96836F'}}>
              {imageModelLabel}
            </div>
            <p className="text-xs line-clamp-2 leading-relaxed" style={{color: '#5C4E3E'}} title={data.prompt}>
              {data.prompt}
            </p>
          </div>
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
      {showMaskEditor && imageUrl && getInlineImage() && (
        <MaskEditorModal
          title="局部编辑生成图"
          sourceImage={getInlineImage()!}
          initialPrompt={data.sourcePrompt || data.prompt || ''}
          onClose={() => setShowMaskEditor(false)}
          onGenerate={handleMaskGenerate}
        />
      )}
      {showCompare && sourceImageUrl && imageUrl && (
        <MaskCompareModal
          originalImageUrl={sourceImageUrl}
          generatedImageUrl={imageUrl}
          prompt={data.sourcePrompt || data.prompt}
          onClose={() => setShowCompare(false)}
          onContinueEdit={() => {
            setShowCompare(false);
            setShowMaskEditor(true);
          }}
          onUseAsReference={() => {
            createReferenceNode();
            setShowCompare(false);
          }}
        />
      )}
    </div>
  );
}
