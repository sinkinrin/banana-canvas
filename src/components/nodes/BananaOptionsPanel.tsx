import { Info } from 'lucide-react';
import { useAppTranslation } from '../../i18n';
import {
  BANANA_MEDIA_RESOLUTION_VALUES,
  BANANA_THINKING_LEVEL_VALUES,
  getBananaModelCapabilities,
  getBananaParameterTipKeys,
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

export function BananaOptionsPanel({
  imageModel,
  value,
  hasReferenceImages,
  onChange,
}: BananaOptionsPanelProps) {
  const { t } = useAppTranslation();
  const options = normalizeBananaOptions(value);
  const capabilities = getBananaModelCapabilities(imageModel);
  const modelConfig = getImageModelConfig(imageModel);
  const parameterTips = [
    t('bananaOptions.onlyForModel', { model: modelConfig.label }),
    capabilities.supportsMediaResolutionControl
      ? t('bananaOptions.mediaWithReferences')
      : t('bananaOptions.mediaUnsupported', { model: modelConfig.label }),
    ...getBananaParameterTipKeys(imageModel).map((key) => t(key)),
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
          {t('bananaOptions.advanced', { model: modelConfig.label })}
        </div>
        <ParameterTipsTooltip tips={parameterTips} />
      </div>

      <p className="text-[11px] leading-relaxed" style={labelStyle}>
        {t(modelConfig.descriptionKey)}
      </p>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium" style={labelStyle}>{t('bananaOptions.thinkingLevel')}</label>
          <select
            name="bananaThinkingLevel"
            value={capabilities.supportsThinkingLevelControl
              ? options.thinkingLevel ?? 'default'
              : 'default'}
            disabled={!capabilities.supportsThinkingLevelControl}
            onChange={(event) => setThinkingLevel(event.target.value as BananaThinkingLevel | 'default')}
            className="nowheel w-full rounded-lg p-2 text-xs outline-none disabled:opacity-40"
            style={selectStyle}
          >
            <option value="default">
              {capabilities.supportsThinkingLevelControl ? t('bananaOptions.defaultMinimal') : t('bananaOptions.modelManaged')}
            </option>
            {capabilities.supportsThinkingLevelControl && BANANA_THINKING_LEVEL_VALUES.map((thinkingLevel) => (
              <option key={thinkingLevel} value={thinkingLevel}>
                {thinkingLevel === 'MINIMAL' ? t('bananaOptions.minimal') : t('bananaOptions.high')}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium" style={labelStyle}>{t('bananaOptions.mediaResolution')}</label>
          <select
            name="bananaMediaResolution"
            value={capabilities.supportsMediaResolutionControl
              ? options.mediaResolution ?? 'default'
              : 'default'}
            disabled={!hasReferenceImages || !capabilities.supportsMediaResolutionControl}
            onChange={(event) => setMediaResolution(event.target.value as BananaMediaResolution | 'default')}
            className="nowheel w-full rounded-lg p-2 text-xs outline-none disabled:opacity-40"
            style={selectStyle}
          >
            <option value="default">
              {capabilities.supportsMediaResolutionControl ? t('common.default') : t('bananaOptions.unsupported')}
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
            name="bananaSearchGrounding"
            value={capabilities.supportsSearchGrounding && options.searchGrounding ? 'on' : 'off'}
            disabled={!capabilities.supportsSearchGrounding}
            onChange={(event) => setSearchGrounding(event.target.value as 'off' | 'on')}
            className="nowheel w-full rounded-lg p-2 text-xs outline-none disabled:opacity-40"
            style={selectStyle}
          >
            <option value="off">
              {capabilities.supportsSearchGrounding ? t('bananaOptions.searchOff') : t('bananaOptions.liteUnsupported')}
            </option>
            {capabilities.supportsSearchGrounding && (
              <option value="on">{t('bananaOptions.searchOn')}</option>
            )}
          </select>
        </div>
      </div>

    </div>
  );
}
