import { Info } from 'lucide-react';
import {
  BANANA_MEDIA_RESOLUTION_VALUES,
  getBananaParameterTips,
  normalizeBananaOptions,
  type BananaMediaResolution,
  type BananaOptions,
  type BananaThinkingLevel,
} from '../../lib/imageModels';
import { ParameterTipsTooltip } from './ParameterTipsTooltip';

type BananaOptionsPanelProps = {
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
  LOW: 'low 快速',
  MEDIUM: 'medium 均衡',
  HIGH: 'high 高推理',
};

export function BananaOptionsPanel({ value, hasReferenceImages, onChange }: BananaOptionsPanelProps) {
  const options = normalizeBananaOptions(value);
  const parameterTips = [
    '这些选项只发送给 Gemini Nano Banana 2；Image2 会使用单独的中转参数面板。',
    '参考图解析仅在带参考图时发送；纯文生图发送会被 Gemini 拒绝。',
    ...getBananaParameterTips(),
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
          Banana2 高级参数
        </div>
        <ParameterTipsTooltip tips={parameterTips} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium" style={labelStyle}>思考等级</label>
          <select
            value={options.thinkingLevel ?? 'default'}
            onChange={(event) => setThinkingLevel(event.target.value as BananaThinkingLevel | 'default')}
            className="nowheel w-full rounded-lg p-2 text-xs outline-none"
            style={selectStyle}
          >
            <option value="default">默认 / dynamic</option>
            {(['MINIMAL', 'LOW', 'MEDIUM', 'HIGH'] as const).map((thinkingLevel) => (
              <option key={thinkingLevel} value={thinkingLevel}>
                {thinkingLevelLabels[thinkingLevel]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium" style={labelStyle}>参考图解析</label>
          <select
            value={options.mediaResolution ?? 'default'}
            disabled={!hasReferenceImages}
            onChange={(event) => setMediaResolution(event.target.value as BananaMediaResolution | 'default')}
            className="nowheel w-full rounded-lg p-2 text-xs outline-none disabled:opacity-40"
            style={selectStyle}
          >
            <option value="default">默认</option>
            {BANANA_MEDIA_RESOLUTION_VALUES.map((mediaResolution) => (
              <option key={mediaResolution} value={mediaResolution}>
                {mediaResolution.replace('MEDIA_RESOLUTION_', '').toLowerCase()}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-[11px] font-medium" style={labelStyle}>Search grounding</label>
          <select
            value={options.searchGrounding ? 'on' : 'off'}
            onChange={(event) => setSearchGrounding(event.target.value as 'off' | 'on')}
            className="nowheel w-full rounded-lg p-2 text-xs outline-none"
            style={selectStyle}
          >
            <option value="off">关闭</option>
            <option value="on">开启 Google Search</option>
          </select>
        </div>
      </div>

    </div>
  );
}
