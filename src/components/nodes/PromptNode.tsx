import { Handle, Position, NodeProps } from '@xyflow/react';
import { useStore } from '../../store';
import type { AppNode } from '../../store';
import React, { useState, useRef } from 'react';
import { Image as ImageIcon, Loader2, Settings2, Sparkles, Wand2, Upload, X, Trash2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { generateImage, optimizePrompt } from '../../services/gemini';

async function readImageFile(file: File): Promise<{ data: string; mimeType: string; url: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64String = event.target?.result as string;
      const match = base64String.match(/^data:(image\/[a-z]+);base64,(.+)$/);
      if (match) {
        resolve({ mimeType: match[1], data: match[2], url: base64String });
      } else {
        reject(new Error('Invalid image format'));
      }
    };
    reader.onerror = () => reject(new Error('读取图片失败'));
    reader.readAsDataURL(file);
  });
}

export function PromptNode({ id, data }: NodeProps<AppNode>) {
  const updateNodeData = useStore((state) => state.updateNodeData);
  const addNode = useStore((state) => state.addNode);
  const deleteNode = useStore((state) => state.deleteNode);
  const nodes = useStore((state) => state.nodes);

  const [prompt, setPrompt] = useState(data.prompt || '');
  const [aspectRatio, setAspectRatio] = useState(data.aspectRatio || '1:1');
  const [imageSize, setImageSize] = useState(data.imageSize || '1K');
  const [batchCount, setBatchCount] = useState(data.batchCount || 1);

  // Migrate old single referenceImage to array
  const initialImages = data.referenceImages
    ? data.referenceImages
    : data.referenceImage ? [data.referenceImage] : [];
  const [referenceImages, setReferenceImages] = useState<Array<{ data: string; mimeType: string; url: string }>>(initialImages);

  const [showSettings, setShowSettings] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [isReadingFile, setIsReadingFile] = useState(false);
  const [generatedCount, setGeneratedCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleDelete = () => {
    deleteNode(id);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset input so the same file can be re-selected later
    e.target.value = '';

    setIsReadingFile(true);
    try {
      const newRefImage = await readImageFile(file);
      const newImages = [...referenceImages, newRefImage].slice(0, 4);
      setReferenceImages(newImages);
      updateNodeData(id, { referenceImages: newImages });
    } catch {
      alert('读取图片失败，请重试');
    } finally {
      setIsReadingFile(false);
    }
  };

  const handleRemoveImage = (index: number) => {
    const newImages = referenceImages.filter((_, i) => i !== index);
    setReferenceImages(newImages);
    updateNodeData(id, { referenceImages: newImages });
  };

  const handleOptimizePrompt = async () => {
    if (!prompt.trim()) return;
    setIsOptimizing(true);
    try {
      const optimized = await optimizePrompt(prompt);
      setPrompt(optimized);
      updateNodeData(id, { prompt: optimized });
    } catch (error) {
      console.error("Failed to optimize prompt:", error);
    } finally {
      setIsOptimizing(false);
    }
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) return;

    // Create a new AbortController for this generation run
    const controller = new AbortController();
    abortControllerRef.current = controller;

    updateNodeData(id, { isLoading: true, error: undefined });
    setGeneratedCount(0);

    try {
      const results = await Promise.allSettled(
        Array.from({ length: batchCount }).map(async () => {
          const url = await generateImage({
            prompt,
            aspectRatio: aspectRatio as any,
            imageSize: imageSize as any,
            referenceImages: referenceImages.length > 0
              ? referenceImages.map(img => ({ data: img.data, mimeType: img.mimeType }))
              : undefined,
            signal: controller.signal,
          });
          setGeneratedCount((prev) => prev + 1);
          return url;
        })
      );

      // Find current node position to place the new nodes nearby
      const currentNode = nodes.find((n) => n.id === id);
      const baseX = currentNode ? currentNode.position.x + 400 : 0;
      const baseY = currentNode ? currentNode.position.y : 0;

      const newEdges: { id: string; source: string; target: string }[] = [];

      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          const imageUrl = result.value;
          const newNodeId = addNode('imageNode', { x: baseX, y: baseY + index * 320 }, { imageUrl, prompt, aspectRatio, imageSize });
          newEdges.push({ id: `e-${id}-${newNodeId}`, source: id, target: newNodeId });
        }
      });

      if (newEdges.length > 0) {
        useStore.setState((state) => ({
          edges: [...state.edges, ...newEdges],
        }));
      }

      // Surface errors for failed items
      const failures = results.filter((r) => r.status === 'rejected');
      if (failures.length > 0) {
        const firstError = (failures[0] as PromiseRejectedResult).reason;
        const errorMessage = firstError?.message || '生成失败';
        updateNodeData(id, { error: errorMessage });

        if (
          errorMessage.includes('Requested entity was not found') ||
          errorMessage.includes('PERMISSION_DENIED') ||
          errorMessage.includes('The caller does not have permission') ||
          errorMessage.includes('API key not valid') ||
          errorMessage.includes('API key is required')
        ) {
          const customKey = localStorage.getItem('custom_gemini_api_key');
          if (customKey) {
            localStorage.removeItem('custom_gemini_api_key');
            alert('您填写的 API Key 无效或没有权限，请重新输入。');
            window.location.reload();
          } else if (window.aistudio?.openSelectKey) {
            await window.aistudio.openSelectKey();
          }
        }
      }
    } catch (error: any) {
      const errorMessage = error.message || '生成失败';
      updateNodeData(id, { error: errorMessage });
    } finally {
      abortControllerRef.current = null;
      updateNodeData(id, { isLoading: false });
    }
  };

  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (!file) continue;

        if (referenceImages.length >= 4) break;

        setIsReadingFile(true);
        try {
          const newRefImage = await readImageFile(file);
          const newImages = [...referenceImages, newRefImage].slice(0, 4);
          setReferenceImages(newImages);
          updateNodeData(id, { referenceImages: newImages });
        } catch {
          alert('读取剪贴板图片失败');
        } finally {
          setIsReadingFile(false);
        }
        break;
      }
    }
  };

  return (
    <div
      className="w-80 bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden transition-all hover:shadow-2xl focus-within:ring-2 focus-within:ring-blue-500/20"
      style={data.color ? { borderColor: data.color, borderWidth: 2 } : undefined}
    >
      <Handle type="target" position={Position.Left} className="w-3 h-3 bg-blue-500 border-2 border-white" />

      <div className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 text-gray-800 font-bold">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-500 to-purple-500 flex items-center justify-center text-white shadow-sm">
              <Sparkles size={16} />
            </div>
            <span>香蕉画图</span>
          </div>
          <div className="flex items-center gap-1 bg-gray-900/80 backdrop-blur-md p-1 rounded-xl border border-white/10 shadow-sm">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              title="设置"
            >
              <Settings2 size={16} />
            </button>
            <button
              onClick={handleDelete}
              className="p-1.5 text-white/80 hover:text-red-400 hover:bg-red-900/40 rounded-lg transition-colors"
              title="删除节点"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <div className="relative">
            <textarea
              value={prompt}
              onPaste={handlePaste}
              onChange={(e) => {
                setPrompt(e.target.value);
                updateNodeData(id, { prompt: e.target.value });
              }}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                  e.preventDefault();
                  if (prompt.trim() && !data.isLoading) handleGenerate();
                }
              }}
              placeholder="描述你想生成的画面... (支持 Ctrl+V 粘贴图片，Ctrl+Enter 生成)"
              className="nodrag w-full h-32 p-3 pb-10 bg-gray-50/50 border border-gray-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all text-sm text-gray-700 placeholder-gray-400"
            />
            <button
              onClick={handleOptimizePrompt}
              disabled={isOptimizing || !prompt.trim()}
              className="absolute bottom-2 right-2 p-1.5 bg-purple-100 text-purple-600 hover:bg-purple-200 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="使用 Gemini 3.1 Pro 优化提示词"
            >
              {isOptimizing ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
              优化
            </button>
          </div>

          {/* Reference Images Section */}
          <div>
            {referenceImages.length > 0 ? (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  {referenceImages.map((img, index) => (
                    <div key={index} className="relative w-full aspect-square bg-gray-100 rounded-lg border border-gray-200 overflow-hidden">
                      <img src={img.url} alt={`参考图 ${index + 1}`} className="w-full h-full object-cover opacity-80" />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveImage(index);
                        }}
                        className="absolute top-1 right-1 p-0.5 bg-red-500 text-white rounded-full shadow hover:bg-red-600 transition-colors z-20"
                        title="移除此参考图"
                      >
                        <X size={10} />
                      </button>
                      <div className="absolute bottom-1 left-1 text-[9px] font-medium text-white bg-black/50 px-1 py-0.5 rounded">
                        {index + 1}/{referenceImages.length}
                      </div>
                    </div>
                  ))}
                </div>
                {referenceImages.length < 4 && (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isReadingFile}
                    className="w-full py-1.5 border border-dashed border-gray-300 rounded-xl text-gray-500 text-xs flex items-center justify-center gap-1.5 hover:bg-gray-50 hover:border-gray-400 transition-colors disabled:opacity-50"
                  >
                    {isReadingFile ? (
                      <>
                        <Loader2 size={12} className="animate-spin" />
                        正在读取...
                      </>
                    ) : (
                      <>
                        <Upload size={12} />
                        添加更多 ({referenceImages.length}/4)
                      </>
                    )}
                  </button>
                )}
              </div>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isReadingFile}
                className="w-full py-2 border border-dashed border-gray-300 rounded-xl text-gray-500 text-xs flex items-center justify-center gap-1.5 hover:bg-gray-50 hover:border-gray-400 transition-colors disabled:opacity-50"
              >
                {isReadingFile ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    正在读取图片...
                  </>
                ) : (
                  <>
                    <Upload size={14} />
                    上传参考图 (支持 Ctrl+V)
                  </>
                )}
              </button>
            )}
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept="image/png, image/jpeg, image/webp, image/heic, image/heif"
              onChange={handleImageUpload}
            />
          </div>

          {showSettings && (
            <div className="p-4 bg-gray-50 rounded-xl space-y-4 border border-gray-100">
              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">画面比例</label>
                <select
                  value={aspectRatio}
                  onChange={(e) => {
                    setAspectRatio(e.target.value);
                    updateNodeData(id, { aspectRatio: e.target.value });
                  }}
                  className="w-full p-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                >
                  <option value="1:1">1:1 (正方形)</option>
                  <option value="4:3">4:3 (标准)</option>
                  <option value="3:4">3:4 (竖版)</option>
                  <option value="16:9">16:9 (宽屏)</option>
                  <option value="9:16">9:16 (手机)</option>
                  <option value="4:1">4:1 (超宽)</option>
                  <option value="1:4">1:4 (超高)</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">分辨率</label>
                <select
                  value={imageSize}
                  onChange={(e) => {
                    setImageSize(e.target.value);
                    updateNodeData(id, { imageSize: e.target.value });
                  }}
                  className="w-full p-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                >
                  <option value="512px">512px (快速)</option>
                  <option value="1K">1K (标准)</option>
                  <option value="2K">2K (高清)</option>
                  <option value="4K">4K (超清)</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">生成数量</label>
                <div className="flex gap-2">
                  {[1, 2, 4].map(count => (
                    <button
                      key={count}
                      onClick={() => {
                        setBatchCount(count);
                        updateNodeData(id, { batchCount: count });
                      }}
                      className={cn(
                        "flex-1 py-1.5 rounded-lg text-sm font-medium transition-colors",
                        batchCount === count
                          ? "bg-blue-600 text-white"
                          : "bg-white border border-gray-200 text-gray-600 hover:border-blue-400"
                      )}
                    >
                      {count}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">节点颜色</label>
                <div className="flex gap-2 flex-wrap">
                  {['', '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#ef4444'].map(color => (
                    <button
                      key={color}
                      onClick={() => {
                        updateNodeData(id, { color });
                      }}
                      className={cn(
                        "w-6 h-6 rounded-full border-2 transition-all",
                        (data.color || '') === color ? "border-gray-800 scale-110" : "border-transparent"
                      )}
                      style={{ backgroundColor: color || '#e5e7eb' }}
                      title={color ? color : '默认'}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {data.error && (
            <div className="p-3 bg-red-50 text-red-600 text-xs rounded-lg border border-red-100">
              {data.error}
            </div>
          )}

          <button
            onClick={handleGenerate}
            disabled={data.isLoading || !prompt.trim()}
            className={cn(
              "w-full py-3 px-4 rounded-xl font-bold text-white shadow-lg flex items-center justify-center gap-2 transition-all",
              data.isLoading
                ? "bg-blue-400 cursor-not-allowed"
                : !prompt.trim()
                ? "bg-blue-300 cursor-not-allowed shadow-none"
                : "bg-blue-600 hover:bg-blue-700 hover:shadow-blue-500/40 active:scale-[0.98]"
            )}
          >
            {data.isLoading ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                <span>
                  {batchCount > 1 ? `生成中 ${generatedCount}/${batchCount}` : '生成中...'}
                </span>
              </>
            ) : (
              <>
                <ImageIcon size={18} />
                <span>生成图像</span>
              </>
            )}
          </button>

          {data.isLoading && (
            <button
              onClick={() => {
                abortControllerRef.current?.abort();
                updateNodeData(id, { isLoading: false });
              }}
              className="w-full py-1 text-[10px] text-gray-400 hover:text-gray-600 transition-colors"
            >
              如果长时间无响应，点击此处重置状态
            </button>
          )}
        </div>
      </div>

      <Handle type="source" position={Position.Right} className="w-3 h-3 bg-purple-500 border-2 border-white" />
    </div>
  );
}
