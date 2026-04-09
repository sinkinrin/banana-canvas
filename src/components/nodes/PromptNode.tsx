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
      className="w-80 rounded-2xl overflow-hidden transition-all"
      style={{
        background: '#1D1A14',
        border: `1px solid ${data.color || 'rgba(242,193,78,0.2)'}`,
        boxShadow: '0 4px 24px rgba(0,0,0,0.5), 0 0 0 0 rgba(242,193,78,0)',
        transition: 'box-shadow 0.2s ease, border-color 0.2s ease',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.boxShadow = '0 8px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(242,193,78,0.35)';
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 24px rgba(0,0,0,0.5), 0 0 0 0 rgba(242,193,78,0)';
      }}
    >
      <Handle type="target" position={Position.Left} className="w-3 h-3 border-2" style={{background: '#9B70D0', borderColor: '#1D1A14'}} />

      <div className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 font-bold">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-yellow-500 to-orange-500 flex items-center justify-center text-white shadow-sm">
              <Sparkles size={16} />
            </div>
            <span style={{color: '#EEE4CE'}}>香蕉画图</span>
          </div>
          <div className="flex items-center gap-1 p-1 rounded-xl shadow-sm" style={{background: 'rgba(22,19,15,0.8)', border: '1px solid rgba(242,193,78,0.15)'}}>
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="p-1.5 rounded-lg transition-colors hover:bg-[rgba(242,193,78,0.1)]"
              style={{color: '#96836F'}}
              title="设置"
            >
              <Settings2 size={16} />
            </button>
            <button
              onClick={handleDelete}
              className="p-1.5 rounded-lg transition-colors hover:text-red-400 hover:bg-[rgba(239,68,68,0.15)]"
              style={{color: '#96836F'}}
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
              className="nodrag w-full h-32 p-3 pb-10 rounded-xl resize-none outline-none text-sm transition-all placeholder-[#5C4E3E]"
              style={{background: '#141210', border: '1px solid rgba(242,193,78,0.15)', color: '#EEE4CE', caretColor: '#F2C14E'}}
              onFocus={e => e.target.style.borderColor = 'rgba(242,193,78,0.45)'}
              onBlur={e => e.target.style.borderColor = 'rgba(242,193,78,0.15)'}
            />
            <button
              onClick={handleOptimizePrompt}
              disabled={isOptimizing || !prompt.trim()}
              className="absolute bottom-2 right-2 p-1.5 rounded-lg text-xs font-medium flex items-center gap-1 transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[rgba(242,193,78,0.2)]"
              style={{background: 'rgba(242,193,78,0.12)', color: '#F2C14E', border: '1px solid rgba(242,193,78,0.2)'}}
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
                    <div key={index} className="relative w-full aspect-square rounded-lg overflow-hidden" style={{background: '#141210', border: '1px solid rgba(242,193,78,0.15)'}}>
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
                      <div className="absolute bottom-1 left-1 px-1 py-0.5 rounded" style={{background: 'rgba(22,19,15,0.8)', color: '#F2C14E', fontSize: '10px', fontWeight: 500}}>
                        {index + 1}/{referenceImages.length}
                      </div>
                    </div>
                  ))}
                </div>
                {referenceImages.length < 4 && (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isReadingFile}
                    className="w-full py-1.5 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
                    style={{border: '1px dashed rgba(242,193,78,0.2)', color: '#5C4E3E'}}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(242,193,78,0.4)'; (e.currentTarget as HTMLElement).style.color = '#96836F'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(242,193,78,0.2)'; (e.currentTarget as HTMLElement).style.color = '#5C4E3E'; }}
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
                className="w-full py-2 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
                style={{border: '1px dashed rgba(242,193,78,0.2)', color: '#5C4E3E'}}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(242,193,78,0.4)'; (e.currentTarget as HTMLElement).style.color = '#96836F'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(242,193,78,0.2)'; (e.currentTarget as HTMLElement).style.color = '#5C4E3E'; }}
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
            <div className="p-4 rounded-xl space-y-4" style={{background: '#141210', border: '1px solid rgba(242,193,78,0.1)'}}>
              <div className="space-y-2">
                <label className="text-xs font-medium uppercase tracking-wider" style={{color: '#96836F'}}>画面比例</label>
                <select
                  value={aspectRatio}
                  onChange={(e) => {
                    setAspectRatio(e.target.value);
                    updateNodeData(id, { aspectRatio: e.target.value });
                  }}
                  className="w-full p-2 rounded-lg text-sm outline-none"
                  style={{background: '#1D1A14', border: '1px solid rgba(242,193,78,0.2)', color: '#EEE4CE'}}
                  onFocus={e => e.target.style.borderColor = 'rgba(242,193,78,0.45)'}
                  onBlur={e => e.target.style.borderColor = 'rgba(242,193,78,0.2)'}
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
                <label className="text-xs font-medium uppercase tracking-wider" style={{color: '#96836F'}}>分辨率</label>
                <select
                  value={imageSize}
                  onChange={(e) => {
                    setImageSize(e.target.value);
                    updateNodeData(id, { imageSize: e.target.value });
                  }}
                  className="w-full p-2 rounded-lg text-sm outline-none"
                  style={{background: '#1D1A14', border: '1px solid rgba(242,193,78,0.2)', color: '#EEE4CE'}}
                  onFocus={e => e.target.style.borderColor = 'rgba(242,193,78,0.45)'}
                  onBlur={e => e.target.style.borderColor = 'rgba(242,193,78,0.2)'}
                >
                  <option value="512px">512px (快速)</option>
                  <option value="1K">1K (标准)</option>
                  <option value="2K">2K (高清)</option>
                  <option value="4K">4K (超清)</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium uppercase tracking-wider" style={{color: '#96836F'}}>生成数量</label>
                <div className="flex gap-2">
                  {[1, 2, 4].map(count => (
                    <button
                      key={count}
                      onClick={() => {
                        setBatchCount(count);
                        updateNodeData(id, { batchCount: count });
                      }}
                      className="flex-1 py-1.5 rounded-lg text-sm font-medium transition-colors"
                      style={batchCount === count
                        ? {background: '#F2C14E', color: '#16130F'}
                        : {background: 'transparent', border: '1px solid rgba(242,193,78,0.2)', color: '#96836F'}}
                      onMouseEnter={e => { if (batchCount !== count) (e.currentTarget as HTMLElement).style.borderColor = 'rgba(242,193,78,0.5)'; }}
                      onMouseLeave={e => { if (batchCount !== count) (e.currentTarget as HTMLElement).style.borderColor = 'rgba(242,193,78,0.2)'; }}
                    >
                      {count}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium uppercase tracking-wider" style={{color: '#96836F'}}>节点颜色</label>
                <div className="flex gap-2 flex-wrap">
                  {['', '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#ef4444'].map(color => (
                    <button
                      key={color}
                      onClick={() => {
                        updateNodeData(id, { color });
                      }}
                      className={cn(
                        "w-6 h-6 rounded-full border-2 transition-all",
                        (data.color || '') === color ? "scale-110" : "border-transparent"
                      )}
                      style={{
                        backgroundColor: color || '#2A2620',
                        borderColor: (data.color || '') === color ? '#F2C14E' : 'transparent'
                      }}
                      title={color ? color : '默认'}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {data.error && (
            <div className="p-3 text-xs rounded-lg" style={{background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#F87171'}}>
              {data.error}
            </div>
          )}

          <button
            onClick={handleGenerate}
            disabled={data.isLoading || !prompt.trim()}
            className="w-full py-3 px-4 rounded-xl font-bold shadow-lg flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              background: data.isLoading || !prompt.trim()
                ? 'rgba(242,193,78,0.15)'
                : 'linear-gradient(135deg, #F2C14E 0%, #D97B3A 100%)',
              color: data.isLoading || !prompt.trim() ? '#5C4E3E' : '#16130F',
              boxShadow: data.isLoading || !prompt.trim()
                ? 'none'
                : '0 4px 20px rgba(242,193,78,0.3)',
            }}
          >
            {data.isLoading ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                <span>{batchCount > 1 ? `生成中 ${generatedCount}/${batchCount}` : '生成中...'}</span>
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
              className="w-full py-1 text-[10px] transition-colors hover:text-[#96836F]"
              style={{color: '#5C4E3E'}}
            >
              如果长时间无响应，点击此处重置状态
            </button>
          )}
        </div>
      </div>

      <Handle type="source" position={Position.Right} className="w-3 h-3 border-2" style={{background: '#5B9BD5', borderColor: '#1D1A14'}} />
    </div>
  );
}
