import { Info } from 'lucide-react';
import {
  BANANA_MEDIA_RESOLUTION_VALUES,
  BANANA_THINKING_LEVEL_VALUES,
  getBananaModelCapabilities,
  getBananaParameterTips,
  getImageModelConfig,
  normalizeBananaOptions,
  type BananaImageModelId,
  type BananaMediaResolution,
  type BananaOptions,
  type BananaThinkingLevel,
} from '../../lib/imageModels';
import { ParameterTipsTooltip } from './ParameterTipsTooltip';

type BananaOptionsPanelProps = {
  imageModel: BananaImageModelId;
  value?: BananaOptions;
  hasReferenceImages: boolean;
  onChange: (options: BananaOptions) => void;
};

const selectStyle = {
  background: '#1D1A14',
  border: '1px solid rgba(242,193,78,0.2)',
  color: '#EEE4CE',
};
const labelStyle = { color: '#96836F' };

const thinkingLevelLabels: Record<BananaThinkingLevel, string> = {
  MINIMAL: 'minimal 最低延迟',
  HIGH: 'high 高推理',
};

export function BananaOptionsPanel({
  imageModel,
  value,
  hasReferenceImages,
  onChange,
}: BananaOptionsPanelProps) {
  const options = normalizeBananaOptions(value);
  const capabilities = getBananaModelCapabilities(imageModel);
  const modelConfig = getImageModelConfig(imageModel);
  const parameterTips = [
    `这些选项只发送给 ${modelConfig.label}；Image2 会使用单独的中转参数面板。`,
    capabilities.supportsMediaResolutionControl
      ? '参考图解析仅在带参考图时发送；纯文生图发送会被 Gemini 拒绝。'
      : `${modelConfig.label} 当前不支持参考图解析等级，本项目不会发送 mediaResolution。`,
    ...getBananaParameterTips(imageModel),
  ];

  const commit = (nextOptions: BananaOptions) => {
    onChange(normalizeBananaOptions(nextOptions));
  };

  const setThinkingLevel = (thinkingLevel: BananaThinkingLevel | 'default') => {
    const nextOptions: BananaOptions = { ...options };
    if (thinkingLevel === 'default') {
      delete nextOptions.thinkingLevel;
    } else {
      nextOptions.thinkingLevel = thinkingLevel;
    }
    commit(nextOptions);
  };

  const setMediaResolution = (mediaResolution: BananaMediaResolution | 'default') => {
    const nextOptions: BananaOptions = { ...options };
    if (mediaResolution === 'default') {
      delete nextOptions.mediaResolution;
    } else {
      nextOptions.mediaResolution = mediaResolution;
    }
    commit(nextOptions);
  };

  const setSearchGrounding = (searchGrounding: 'off' | 'on') => {
    const nextOptions: BananaOptions = { ...options };
    if (searchGrounding === 'on') {
      nextOptions.searchGrounding = true;
    } else {
      delete nextOptions.searchGrounding;
    }
    commit(nextOptions);
  };

  return (
    <div className="space-y-4 rounded-xl p-3" style={{ background: 'rgba(242,193,78,0.04)', border: '1px solid rgba(242,193,78,0.12)' }}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider" style={{ color: '#F2C14E' }}>
          <Info size={13} />
          {modelConfig.label} 高级参数
        </div>
        <ParameterTipsTooltip tips={parameterTips} />
      </div>

      <p className="text-[11px] leading-relaxed" style={labelStyle}>
        {modelConfig.description}
      </p>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium" style={labelStyle}>思考等级</label>
          <select
            value={capabilities.supportsThinkingLevelControl
              ? options.thinkingLevel ?? 'default'
              : 'default'}
            disabled={!capabilities.supportsThinkingLevelControl}
            onChange={(event) => setThinkingLevel(event.target.value as BananaThinkingLevel | 'default')}
            className="nowheel w-full rounded-lg p-2 text-xs outline-none disabled:opacity-40"
            style={selectStyle}
          >
            <option value="default">
              {capabilities.supportsThinkingLevelControl ? '默认 / minimal' : '模型自动管理'}
            </option>
            {capabilities.supportsThinkingLevelControl && BANANA_THINKING_LEVEL_VALUES.map((thinkingLevel) => (
              <option key={thinkingLevel} value={thinkingLevel}>
                {thinkingLevelLabels[thinkingLevel]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium" style={labelStyle}>参考图解析</label>
          <select
            value={capabilities.supportsMediaResolutionControl
              ? options.mediaResolution ?? 'default'
              : 'default'}
            disabled={!hasReferenceImages || !capabilities.supportsMediaResolutionControl}
            onChange={(event) => setMediaResolution(event.target.value as BananaMediaResolution | 'default')}
            className="nowheel w-full rounded-lg p-2 text-xs outline-none disabled:opacity-40"
            style={selectStyle}
          >
            <option value="default">
              {capabilities.supportsMediaResolutionControl ? '默认' : '模型不支持'}
            </option>
            {capabilities.supportsMediaResolutionControl && BANANA_MEDIA_RESOLUTION_VALUES.map((mediaResolution) => (
              <option key={mediaResolution} value={mediaResolution}>
                {mediaResolution.replace('MEDIA_RESOLUTION_', '').toLowerCase()}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-[11px] font-medium" style={labelStyle}>Search grounding</label>
          <select
            value={capabilities.supportsSearchGrounding && options.searchGrounding ? 'on' : 'off'}
            disabled={!capabilities.supportsSearchGrounding}
            onChange={(event) => setSearchGrounding(event.target.value as 'off' | 'on')}
            className="nowheel w-full rounded-lg p-2 text-xs outline-none disabled:opacity-40"
            style={selectStyle}
          >
            <option value="off">
              {capabilities.supportsSearchGrounding ? '关闭' : 'Lite 不支持'}
            </option>
            {capabilities.supportsSearchGrounding && (
              <option value="on">开启 Google Search</option>
            )}
          </select>
        </div>
      </div>

    </div>
  );
}
