import { getPromptImageCount, promptImageCountPatch } from './promptImageCount';
import { isOfficialImageModel } from '../../lib/officialImages';
import { OfficialImageOptionsPanel } from './OfficialImageOptionsPanel';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { useStore, type AppNode } from '../../store';
import { useEffect, useState } from 'react';
import { useAppTranslation } from '../../i18n';
import { BookOpen, Image as ImageIcon, Loader2, PencilLine, Sparkles, Wand2, Upload, Trash2 } from 'lucide-react';
import { type InlineImageData } from '../../lib/canvasState';
import { optimizePrompt } from '../../services/gemini';
import { PromptTextarea } from './PromptTextarea';
import {
  BANANA_IMAGE_SIZE_VALUES,
  IMAGE_MODELS,
  getBananaImageSizeValues,
  isBananaImageModel,
  isImage2Model,
  getImage2MaskModel,
  normalizeBananaImageSize,
  normalizeBananaImageSizeForModel,
  normalizeImageModel,
  type BananaAspectRatio,
  type BananaImageSize,
  type ImageModelId,
} from '../../lib/imageModels';
import { BananaOptionsPanel } from './BananaOptionsPanel';
import { Image2OptionsPanel } from './Image2OptionsPanel';
import { ModelComparisonSetup, type ComparisonSelection } from './ModelComparisonDialog';
import { NodeCategory } from './NodeCategory';
import { inheritNodeCategory } from '../../lib/nodeCategories';
import { MaskEditorModal, type MaskGeneratePayload } from '../mask/MaskEditorModal';
import { useReferenceImages } from './useReferenceImages';
import { buildPromptMaskGenerationPayload, useMaskGeneration, officialOptionsForEdit } from './useMaskGeneration';
import { usePromptGeneration } from './usePromptGeneration';
import { SketchEditorModal } from '../sketch/SketchEditorModal';
import type { SketchSavePayload } from '../sketch/sketchGeometry';
import {
  getEffectivePromptAspectRatio,
  getImage2MaskEditAspectRatio,
  getPromptAspectRatioOptions,
} from './promptAspectRatios';
import { PromptLibraryDialog } from '../prompts/PromptLibraryDialog';
import { ImageViewer } from '../ImageViewer';
import { ReferenceImageThumbnail } from './ReferenceImageThumbnail';
import {
  formatMebibytes,
  getImageInputLimits,
} from '../../lib/imageInputLimits';

const aspectRatioLabelKeys: Record<BananaAspectRatio, string> = {
  '1:1': 'promptNode.aspectRatios.square',
  '1:4': 'promptNode.aspectRatios.extraTall',
  '1:8': 'promptNode.aspectRatios.extremeTall',
  '2:3': 'promptNode.aspectRatios.portrait23',
  '3:2': 'promptNode.aspectRatios.landscape32',
  '3:4': 'promptNode.aspectRatios.portrait34',
  '4:1': 'promptNode.aspectRatios.extraWide',
  '4:3': 'promptNode.aspectRatios.standard',
  '4:5': 'promptNode.aspectRatios.socialPortrait',
  '5:4': 'promptNode.aspectRatios.socialLandscape',
  '8:1': 'promptNode.aspectRatios.extremeWide',
  '9:16': 'promptNode.aspectRatios.phone',
  '16:9': 'promptNode.aspectRatios.widescreen',
  '21:9': 'promptNode.aspectRatios.cinematic',
};

const imageSizeLabelKeys: Record<BananaImageSize, string> = {
  '512': 'promptNode.sizes.fast',
  '1K': 'promptNode.sizes.standard',
  '2K': 'promptNode.sizes.high',
  '4K': 'promptNode.sizes.ultra',
};

export function PromptNode({ id, data }: NodeProps<AppNode>) {
  const { t } = useAppTranslation();
  const updateNodeData = useStore((state) => state.updateNodeData);
  const saveNodeSketch = useStore((state) => state.saveNodeSketch);
  const addNode = useStore((state) => state.addNode);
  const assets = useStore((state) => state.assets);
  const assetsHydrated = useStore((state) => state.assetsHydrated);
  const deleteNode = useStore((state) => state.deleteNode);
  const nodePosition = useStore((state) => {
    const node = state.nodes.find((n) => n.id === id);
    return node?.position;
  });

  const [prompt, setPrompt] = useState(data.prompt || '');
  const [showComparisonSetup, setShowComparisonSetup] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [previewSource, setPreviewSource] = useState<{ image: InlineImageData; index: number } | null>(null);
  const [maskEditorSource, setMaskEditorSource] = useState<{ image: InlineImageData; index: number } | null>(null);
  const [isSketchEditorOpen, setIsSketchEditorOpen] = useState(false);
  const [isPromptLibraryOpen, setIsPromptLibraryOpen] = useState(false);
  const {
    fileInputRef,
    isReadingFile,
    referenceImages,
    referenceImageIds,
    hasPendingReferenceHydration,
    removeReferenceImage,
    handleImageUpload,
    handlePaste,
  } = useReferenceImages({
    nodeId: id,
    data,
    assets,
    assetsHydrated,
    updateNodeData,
  });
  const { generateMaskImage } = useMaskGeneration(id);
  const batchCount = data.batchCount || 1;
  const imageModel = normalizeImageModel(data.imageModel);
  const imageSize = isBananaImageModel(imageModel)
    ? normalizeBananaImageSizeForModel(imageModel, data.imageSize) ?? '1K'
    : isOfficialImageModel(imageModel) && data.imageSize === '512' ? '1K' : normalizeBananaImageSize(data.imageSize) ?? '1K';
  const imageSizeOptions = isBananaImageModel(imageModel)
    ? getBananaImageSizeValues(imageModel)
    : isOfficialImageModel(imageModel) ? BANANA_IMAGE_SIZE_VALUES.filter(size => size !== '512') : BANANA_IMAGE_SIZE_VALUES;
  const aspectRatio = getEffectivePromptAspectRatio(imageModel, data.aspectRatio);
  const aspectRatioOptions = getPromptAspectRatioOptions(imageModel);
  const imageModelLabel = IMAGE_MODELS.find((model) => model.id === imageModel)?.label ?? 'Image2';
  const referenceImageLimitHint = t('promptNode.referenceLimitHint', {
    single: formatMebibytes(getImageInputLimits(imageModel).single),
    total: formatMebibytes(getImageInputLimits(imageModel).total),
  });
  const bananaOptions = data.bananaOptions;
  const image2Options = data.image2Options;
  const officialImageOptions = data.officialImageOptions;
  const imageCount = getPromptImageCount(imageModel, batchCount, officialImageOptions);
  const countChoices = [...new Set([1, 2, 4, imageCount])].sort((a, b) => a - b);
  const customSize = isOfficialImageModel(imageModel) && Boolean(officialImageOptions?.size);
  const modelDescription = IMAGE_MODELS.find(model => model.id === imageModel)?.descriptionKey;
  const referenceLimit = getImageInputLimits(imageModel).count;
  const sketchReferenceIsAttached = Boolean(
    data.sketch?.referenceImageAssetId &&
    referenceImageIds.includes(data.sketch.referenceImageAssetId)
  );

  useEffect(() => {
    setPrompt(data.prompt || '');
  }, [data.prompt]);

  const commitPrompt = (nextPrompt: string) => {
    if (nextPrompt !== (data.prompt || '')) {
      updateNodeData(id, { prompt: nextPrompt });
    }
  };

  const { generatedCount, taskCount, runGeneration, abortGeneration } = usePromptGeneration({
    nodeId: id,
    nodePosition,
    updateNodeData,
    addNode,
    deleteNode,
    setEdges: (edges) => {
      useStore.setState((state) => ({
        edges: [...state.edges, ...edges],
      }));
    },
    commitPrompt,
  });

  const handleDelete = () => {
    deleteNode(id);
  };

  const handleRemoveImage = (index: number) => {
    removeReferenceImage(index);
  };

  const handleMaskGenerate = async ({ prompt: maskPrompt, maskImage, sourceImage, editMode }: MaskGeneratePayload) => {
    if (!maskEditorSource) return;
    const editOptions = officialOptionsForEdit(officialImageOptions);

    const baseX = nodePosition ? nodePosition.x + 480 : 0;
    const baseY = nodePosition ? nodePosition.y : 0;
    const createdAt = new Date().toISOString();
    const maskEditAspectRatio = getImage2MaskEditAspectRatio(data.aspectRatio, isOfficialImageModel(imageModel) ? imageModel : 'image2');
    const placeholderNodeId = addNode(
      'imageNode',
      { x: baseX, y: baseY },
      {
        prompt: maskPrompt,
        ...inheritNodeCategory(data),
        imageModel: getImage2MaskModel(imageModel),
        aspectRatio: maskEditAspectRatio,
        imageSize,
        image2Options,
        officialImageOptions: editOptions,
        isLoading: true,
        error: undefined,
        createdAt,
        sourceImage,
        sourcePrompt: maskPrompt,
        generationMode: 'mask-edit',
      }
    );

    useStore.setState((state) => ({
      edges: [
        ...state.edges,
        { id: `e-${id}-${placeholderNodeId}`, source: id, target: placeholderNodeId },
      ],
    }));

    try {
      const { imageUrl: url, generationInfo } = await generateMaskImage(buildPromptMaskGenerationPayload({
        imageModel,
        maskPrompt,
        maskImage,
        sourceImage,
        sourceIndex: maskEditorSource.index,
        editMode,
        referenceImages,
        aspectRatio: maskEditAspectRatio,
        imageSize,
        image2Options,
        officialImageOptions: editOptions,
      }), placeholderNodeId);

      updateNodeData(placeholderNodeId, {
        imageUrl: url,
        generationInfo,
        prompt: maskPrompt,
        imageModel: getImage2MaskModel(imageModel),
        aspectRatio: maskEditAspectRatio,
        imageSize,
        image2Options,
        officialImageOptions: editOptions,
        sourceImage,
        sourcePrompt: maskPrompt,
        generationMode: 'mask-edit',
        isLoading: false,
        error: undefined,
      });
      setMaskEditorSource(null);
    } catch (error) {
      const errorMessage = error instanceof Error && error.name === 'AbortError' ? t('generating.stopped') : error instanceof Error ? error.message : t('promptNode.errors.maskGeneration');
      updateNodeData(placeholderNodeId, {
        isLoading: false,
        error: errorMessage,
      });
      throw error;
    }
  };

  const handleOptimizePrompt = async () => {
    if (!prompt.trim()) return;
    setIsOptimizing(true);
    try {
      const optimized = await optimizePrompt(prompt);
      setPrompt(optimized);
      commitPrompt(optimized);
    } catch (error) {
      console.error("Failed to optimize prompt:", error);
    } finally {
      setIsOptimizing(false);
    }
  };

  const handleGenerate = async (promptToUse = prompt) => {
    await runGeneration({
      prompt: promptToUse,
      imageModel,
      imageModelLabel,
      aspectRatio,
      imageSize,
      bananaOptions,
      image2Options,
      officialImageOptions,
      batchCount,
      referenceImageIds,
      referenceImages,
      hasPendingReferenceHydration,
    });
  };

  const handleApplySketch = async (payload: SketchSavePayload) => {
    const result = saveNodeSketch(id, payload);
    if (!result.ok) throw new Error(result.error);
    setIsSketchEditorOpen(false);
  };

  const handleCompare = (selection: ComparisonSelection) => {
    const groupId = crypto.randomUUID();
    setShowComparisonSetup(false);
    void runGeneration({ prompt, imageModel, imageModelLabel, ...selection,
      comparisonModels: selection.models, comparisonGroupId: groupId,
      bananaOptions, image2Options, officialImageOptions, batchCount: 1, referenceImageIds, referenceImages, hasPendingReferenceHydration });
  };

  return (
    <div
      data-prompt-node-id={id}
      className="w-[400px] rounded-2xl overflow-hidden transition-all"
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
            <span style={{color: '#EEE4CE'}}>{t('app.name')}</span>
          </div>
          <div className="nodrag nopan nowheel flex items-center gap-1 p-1 rounded-xl shadow-sm" style={{background: 'rgba(22,19,15,0.8)', border: '1px solid rgba(242,193,78,0.15)'}} onPointerDown={(event) => event.stopPropagation()}>
            <NodeCategory nodeId={id} />
            <button
              type="button"
              onClick={handleDelete}
              className="p-1.5 rounded-lg transition-colors hover:text-red-400 hover:bg-[rgba(239,68,68,0.15)]"
              style={{color: '#96836F'}}
              title={t('promptNode.deleteNode')}
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <div className="relative">
            <PromptTextarea
              value={prompt}
              onPaste={handlePaste}
              isLoading={Boolean(data.isLoading)}
              onDraftChange={setPrompt}
              onCommit={commitPrompt}
              onSubmit={handleGenerate}
            />
            <button
              type="button"
              onClick={handleOptimizePrompt}
              disabled={isOptimizing || !prompt.trim()}
              className="nodrag nopan nowheel absolute bottom-2 right-2 p-1.5 rounded-lg text-xs font-medium flex items-center gap-1 transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[rgba(242,193,78,0.2)]"
              style={{background: 'rgba(242,193,78,0.12)', color: '#F2C14E', border: '1px solid rgba(242,193,78,0.2)'}}
              title={t('promptNode.optimizeTitle')}
            >
              {isOptimizing ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
              {t('promptNode.optimize')}
            </button>
            <button
              type="button"
              data-prompt-library-entry="node"
              onClick={() => setIsPromptLibraryOpen(true)}
              className="nodrag nopan nowheel absolute bottom-2 left-2 flex items-center gap-1 rounded-lg p-1.5 text-xs font-medium transition-all hover:bg-[rgba(242,193,78,0.14)]"
              style={{ background: 'rgba(22,19,15,0.84)', color: '#B8A58D', border: '1px solid rgba(242,193,78,0.14)' }}
              title={t('promptNode.openPromptLibrary')}
            >
              <BookOpen size={14} />
              {t('canvas.promptLibrary')}
            </button>
          </div>

          <div className="nodrag nopan nowheel space-y-2" onPointerDown={event => event.stopPropagation()}>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => fileInputRef.current?.click()}
                disabled={isReadingFile || referenceImages.length >= referenceLimit}
                title={`${referenceImageLimitHint} · ${t('promptNode.referenceCompatibilityHint')}`}
                className="flex min-h-10 items-center justify-center gap-2 rounded-xl border border-dashed border-[#F2C14E]/30 px-2 text-xs text-[#D6C3A0] transition-colors hover:bg-[#F2C14E]/10 disabled:cursor-not-allowed disabled:opacity-40">
                {isReadingFile ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                {isReadingFile ? t('promptNode.reading') : t('promptNode.addReference')}
                {referenceImages.length > 0 && <span>{referenceImages.length}/{referenceLimit}</span>}
              </button>
              <button type="button" data-sketch-action="open" onClick={() => setIsSketchEditorOpen(true)}
                disabled={!data.sketch && referenceImages.length >= referenceLimit}
                className="flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[#5B9BD5]/30 bg-[#5B9BD5]/10 px-2 text-xs text-[#8FC1EA] disabled:cursor-not-allowed disabled:opacity-40"
                title={data.sketch ? t(sketchReferenceIsAttached ? 'promptNode.editAttachedSketch' : 'promptNode.editDetachedSketch') : t('promptNode.sketchHint')}>
                <PencilLine size={14} />
                {data.sketch ? t('promptNode.editSketch') : t('promptNode.drawSketch')}
              </button>
            </div>
            {referenceImages.length > 0 && <div className="grid max-h-48 grid-cols-3 gap-2 overflow-y-auto overscroll-contain">
              {referenceImages.map((img, index) => (
                <ReferenceImageThumbnail key={referenceImageIds[index] ?? index} image={img} index={index}
                  isSketch={referenceImageIds[index] === data.sketch?.referenceImageAssetId}
                  badge={referenceImageIds[index] === data.sketch?.referenceImageAssetId
                    ? t('promptNode.sketchBadge', { index: index + 1, total: referenceImages.length })
                    : `${index + 1}/${referenceImages.length}`}
                  onOpen={() => setPreviewSource({ image: img, index })} onRemove={() => handleRemoveImage(index)} />
              ))}
            </div>}
            <input type="file" ref={fileInputRef} className="hidden"
              accept="image/png,image/jpeg,image/webp,image/gif,image/avif,image/heic,image/heif,.mpo" onChange={handleImageUpload} />
          </div>

          {data.error && (
            <div className="p-3 text-xs rounded-lg" style={{background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#F87171'}}>
              {data.error}
            </div>
          )}

          <div data-prompt-settings="true" className="nodrag nopan nowheel space-y-4" onPointerDown={(event) => event.stopPropagation()}>
            <div className="space-y-2">
              <label className="text-xs font-medium uppercase tracking-wider" style={{color: '#B8A58D'}}>{t('promptNode.imageModel')}</label>
              <select
                aria-label={t('promptNode.imageModel')}
                title={modelDescription ? t(modelDescription) : imageModelLabel}
                name="imageModel"
                value={imageModel}
                onChange={(e) => {
                  const nextModel = e.target.value as ImageModelId;
                  if (referenceImages.length > getImageInputLimits(nextModel).count) { updateNodeData(id, { error: t('officialImages.removeReferences', { max: getImageInputLimits(nextModel).count }) }); return; }
                  updateNodeData(id, {
                    imageModel: nextModel,
                    aspectRatio: getEffectivePromptAspectRatio(nextModel, data.aspectRatio),
                    imageSize: isBananaImageModel(nextModel)
                      ? normalizeBananaImageSizeForModel(nextModel, data.imageSize) ?? '1K'
                      : isOfficialImageModel(nextModel) && data.imageSize === '512' ? '1K' : normalizeBananaImageSize(data.imageSize) ?? '1K',
                  });
                }}
                className="nowheel w-full min-w-0 p-2 rounded-lg text-sm outline-none disabled:opacity-40"
                style={{background: '#1D1A14', border: '1px solid rgba(242,193,78,0.2)', color: '#EEE4CE'}}
                onFocus={e => e.target.style.borderColor = 'rgba(242,193,78,0.45)'}
                onBlur={e => e.target.style.borderColor = 'rgba(242,193,78,0.2)'}
              >
                {IMAGE_MODELS.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-xs font-medium uppercase tracking-wider" style={{color: '#B8A58D'}}>{t('promptNode.aspectRatio')}</label>
                <select
                  aria-label={t('promptNode.aspectRatio')}
                  name="aspectRatio"
                  value={customSize ? 'custom' : aspectRatio}
                  onChange={(e) => {
                    if (isOfficialImageModel(imageModel)) {
                      const next = { ...officialImageOptions };
                      if (e.target.value === 'custom') {
                        next.size = next.size || 'auto';
                        updateNodeData(id, { officialImageOptions: next });
                        return;
                      }
                      delete next.size;
                      updateNodeData(id, { aspectRatio: e.target.value as typeof aspectRatio, officialImageOptions: next });
                    } else updateNodeData(id, { aspectRatio: e.target.value as typeof aspectRatio });
                  }}
                  className="nowheel w-full min-w-0 p-2 rounded-lg text-sm outline-none disabled:opacity-40"
                  style={{background: '#1D1A14', border: '1px solid rgba(242,193,78,0.2)', color: '#EEE4CE'}}
                  onFocus={e => e.target.style.borderColor = 'rgba(242,193,78,0.45)'}
                  onBlur={e => e.target.style.borderColor = 'rgba(242,193,78,0.2)'}
                >
                  {isOfficialImageModel(imageModel) && <option value="custom">{t('promptNode.customSize')}</option>}
                  {aspectRatioOptions.map((ratio) => (
                    <option key={ratio} value={ratio}>{t(aspectRatioLabelKeys[ratio])}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium uppercase tracking-wider" style={{color: '#B8A58D'}}>{t('promptNode.resolution')}</label>
                <select
                  aria-label={t('promptNode.resolution')}
                  disabled={customSize}
                  name="imageSize"
                  value={imageSize}
                  onChange={(e) => {
                    updateNodeData(id, { imageSize: e.target.value as typeof imageSize });
                  }}
                  className="nowheel w-full min-w-0 p-2 rounded-lg text-sm outline-none disabled:opacity-40"
                  style={{background: '#1D1A14', border: '1px solid rgba(242,193,78,0.2)', color: '#EEE4CE'}}
                  onFocus={e => e.target.style.borderColor = 'rgba(242,193,78,0.45)'}
                  onBlur={e => e.target.style.borderColor = 'rgba(242,193,78,0.2)'}
                >
                  {imageSizeOptions.map((size) => (
                    <option key={size} value={size}>{t(imageSizeLabelKeys[size])}</option>
                  ))}
                </select>
              </div>

            </div>
            {customSize && <label className="block space-y-2 text-xs text-[#B8A58D]">
              <span>{t('officialImages.size')}</span>
              <input name="officialImage.size" key={officialImageOptions?.size} defaultValue={officialImageOptions?.size ?? ''} placeholder="auto / 1536x864"
                className="w-full rounded-lg border border-[#F2C14E]/20 bg-[#141210] p-2 text-sm text-[#EEE4CE]"
                onBlur={event => {
                  const next = { ...officialImageOptions };
                  if (event.target.value) next.size = event.target.value;
                  else delete next.size;
                  updateNodeData(id, { officialImageOptions: next });
                }} />
            </label>}
            <div className="flex items-center justify-between gap-3">
              <label className="text-xs font-medium text-[#B8A58D]">{t('promptNode.batchCount')}</label>
              <div className="flex gap-1 rounded-lg border border-[#F2C14E]/15 bg-[#141210] p-1" role="group" aria-label={t('promptNode.batchCount')}>
                {countChoices.map(count => (
                  <button
                    type="button"
                    key={count}
                    data-generation-count={count}
                    aria-pressed={imageCount === count}
                    onClick={() => {
                      updateNodeData(id, promptImageCountPatch(imageModel, count, officialImageOptions));
                    }}
                    className="min-w-10 rounded-md px-2 py-1 text-sm font-medium transition-colors"
                    style={imageCount === count
                      ? {background: '#F2C14E', color: '#16130F'}
                      : {background: 'transparent', border: '1px solid rgba(242,193,78,0.2)', color: '#96836F'}}
                    onMouseEnter={e => { if (imageCount !== count) (e.currentTarget as HTMLElement).style.borderColor = 'rgba(242,193,78,0.5)'; }}
                    onMouseLeave={e => { if (imageCount !== count) (e.currentTarget as HTMLElement).style.borderColor = 'rgba(242,193,78,0.2)'; }}
                  >
                    {count}
                  </button>
                ))}
              </div>
            </div>

            {isBananaImageModel(imageModel) && (
              <BananaOptionsPanel
                imageModel={imageModel}
                value={bananaOptions}
                hasReferenceImages={referenceImages.length > 0}
                onChange={(nextOptions) => {
                  updateNodeData(id, {
                    bananaOptions: Object.keys(nextOptions).length > 0 ? nextOptions : undefined,
                  });
                }}
              />
            )}

            {isOfficialImageModel(imageModel) && <OfficialImageOptionsPanel imageModel={imageModel} value={officialImageOptions} referenceCount={referenceImages.length} onChange={next => updateNodeData(id, { officialImageOptions: next })} />}
            {isImage2Model(imageModel) && (
              <Image2OptionsPanel
                imageModel={imageModel}
                value={image2Options}
                hasReferenceImages={referenceImages.length > 0}
                onChange={(nextOptions) => {
                  updateNodeData(id, {
                    image2Options: Object.keys(nextOptions).length > 0 ? nextOptions : undefined,
                  });
                }}
              />
            )}

          </div>

          <button
            type="button"
            data-generate-image="true"
            onClick={() => handleGenerate()}
            disabled={data.isLoading || !prompt.trim() || hasPendingReferenceHydration}
            className="nodrag nopan nowheel w-full py-3 px-4 rounded-xl font-bold shadow-lg flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              background: data.isLoading || !prompt.trim()
                ? 'rgba(242,193,78,0.15)'
                : 'linear-gradient(135deg, #F2C14E 0%, #D97B3A 100%)',
              color: data.isLoading || !prompt.trim() ? '#B8A58D' : '#16130F',
              boxShadow: data.isLoading || !prompt.trim()
                ? 'none'
                : '0 4px 20px rgba(242,193,78,0.3)',
            }}
          >
            {data.isLoading ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                <span>{taskCount > 1
                  ? t('promptNode.generatingProgress', { generated: generatedCount, total: taskCount })
                  : t('promptNode.generating')}</span>
              </>
            ) : (
              <>
                <ImageIcon size={18} />
                <span>{t(imageCount > 1 ? 'promptNode.generateCount' : 'promptNode.generate', { count: imageCount })}</span>
              </>
            )}
          </button>

          <button type="button" data-compare-models="true" disabled={data.isLoading || !prompt.trim() || hasPendingReferenceHydration} onClick={() => setShowComparisonSetup(true)} className="nodrag nopan nowheel w-full py-1 text-xs text-[#B8A58D] hover:text-[#EEE4CE] disabled:opacity-40">{t('comparison.title')}</button>
          {showComparisonSetup && <ModelComparisonSetup defaults={{ aspectRatio, imageSize }} onClose={() => setShowComparisonSetup(false)} onStart={handleCompare} />}

          {data.isLoading && (
            <button
              type="button"
              onClick={() => {
                abortGeneration();
                updateNodeData(id, { isLoading: false });
              }}
              className="nodrag nopan nowheel w-full py-1 text-[10px] transition-colors hover:text-[#96836F]"
              style={{color: '#5C4E3E'}}
            >
              {t('promptNode.resetLoading')}
            </button>
          )}


        </div>
      </div>

      <Handle type="source" position={Position.Right} className="w-3 h-3 border-2" style={{background: '#5B9BD5', borderColor: '#1D1A14'}} />
      {previewSource && (
        <ImageViewer
          imageUrl={previewSource.image.url}
          onClose={() => setPreviewSource(null)}
          onMaskEdit={() => { setMaskEditorSource(previewSource); setPreviewSource(null); }}
        />
      )}
      {maskEditorSource && (
        <MaskEditorModal
          allowMarkup={isOfficialImageModel(imageModel) && imageModel !== 'openai-image2'}
          title={t('promptNode.maskEditTitle')}
          sourceImage={maskEditorSource.image}
          onClose={() => setMaskEditorSource(null)}
          onGenerate={handleMaskGenerate}
        />
      )}
      {isSketchEditorOpen && (
        <SketchEditorModal
          aspectRatio={data.sketch?.aspectRatio ?? aspectRatio}
          initialSnapshot={data.sketch?.snapshot}
          onClose={() => setIsSketchEditorOpen(false)}
          onApply={handleApplySketch}
        />
      )}
      {isPromptLibraryOpen && (
        <PromptLibraryDialog
          initialPrompt={prompt}
          onClose={() => setIsPromptLibraryOpen(false)}
          onUsePrompt={(nextPrompt) => {
            setPrompt(nextPrompt);
            commitPrompt(nextPrompt);
          }}
        />
      )}
    </div>
  );
}
