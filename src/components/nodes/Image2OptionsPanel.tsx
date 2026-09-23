import { Info } from 'lucide-react';
import { useId } from 'react';
import { useAppTranslation } from '../../i18n';
import {
  getImage2RelayParameterTipKeys,
  getImageModelConfig,
  isImage25Model,
  normalizeImage2Options,
  type Image2Background,
  type Image2ModelId,
  type Image2Options,
  type Image2OutputFormat,
  type Image2Quality,
  type Image2ResponseFormat,
} from '../../lib/imageModels';
import { ParameterTipsTooltip } from './ParameterTipsTooltip';

type Image2OptionsPanelProps = {
  imageModel?: Image2ModelId;
  value?: Image2Options;
  hasReferenceImages: boolean;
  onChange: (options: Image2Options) => void;
};

const selectStyle = {
  background: '#1D1A14',
  border: '1px solid rgba(242,193,78,0.2)',
  color: '#EEE4CE',
};

const labelStyle = { color: '#96836F' };

export function Image2OptionsPanel({ imageModel = 'image2', value, hasReferenceImages, onChange }: Image2OptionsPanelProps) {
  const { t } = useAppTranslation();
  const backgroundId = useId();
  const options = normalizeImage2Options(value, imageModel);
  const isImage25 = isImage25Model(imageModel);
  const outputFormat = options.outputFormat ?? 'png';
  const supportsCompression = outputFormat === 'jpeg' || outputFormat === 'webp';
  const compression = options.outputCompression ?? 100;
  const partialImages = options.partialImages ?? 1;
  const parameterTips = [
    t('image2Options.tips.onlyImage2'),
    isImage25
      ? t('image2Options.tips.reference25')
      : hasReferenceImages
      ? t('image2Options.tips.fidelityAttached')
      : t('image2Options.tips.fidelityEmpty'),
    ...getImage2RelayParameterTipKeys(imageModel).map((key) => t(key)),
  ];

  const commit = (nextOptions: Image2Options) => {
    onChange(normalizeImage2Options(nextOptions, imageModel));
  };

  const setOption = (patch: Image2Options) => {
    commit({ ...options, ...patch });
  };

  const setOutputFormat = (nextOutputFormat: Image2OutputFormat) => {
    const nextOptions: Image2Options = { ...options, outputFormat: nextOutputFormat };
    if (nextOutputFormat === 'png') {
      delete nextOptions.outputCompression;
    }
    commit(nextOptions);
  };

  return (
    <details data-advanced-options="image2" className="rounded-xl p-3" style={{ background: 'rgba(242,193,78,0.04)', border: '1px solid rgba(242,193,78,0.12)' }}>
      <summary className="cursor-pointer text-xs text-[#F2C14E]">
        <span className="inline-flex items-center gap-2">
          {isImage25 ? t('image2Options.advanced25') : t('image2Options.advanced')}
          {((options.quality && options.quality !== 'auto') || outputFormat !== 'png' || (options.responseFormat && options.responseFormat !== 'b64_json') || partialImages !== 1 || (supportsCompression && compression !== 100) || (options.background && options.background !== 'opaque')) && <span className="text-[10px] text-[#B8A58D]">{t('categories.custom')}</span>}
        </span>
      </summary>
      <div className="mt-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider" style={{ color: '#F2C14E' }}>
          <Info size={13} />
          {isImage25 ? t('image2Options.advanced25') : t('image2Options.advanced')}
        </div>
        <ParameterTipsTooltip tips={parameterTips} />
      </div>

      {isImage25 && (
        <p className="text-xs leading-relaxed" style={labelStyle}>
          {t(getImageModelConfig(imageModel).descriptionKey)} · {t('image2Options.summary25')}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium" style={labelStyle}>{t('image2Options.quality')}</label>
          <select
            aria-label={t('image2Options.quality')}
            name="image2Quality"
            value={options.quality ?? 'auto'}
            onChange={(event) => setOption({ quality: event.target.value as Image2Quality })}
            className="nowheel w-full rounded-lg p-2 text-xs outline-none"
            style={selectStyle}
          >
            <option value="auto">{t('image2Options.qualityAuto')}</option>
            <option value="low">{t('image2Options.qualityLow')}</option>
            <option value="medium">{t('image2Options.qualityMedium')}</option>
            <option value="high">{t('image2Options.qualityHigh')}</option>
            {isImage25 && <option value="xhigh" disabled>{t('image2Options.qualityXhighPending')}</option>}
            {isImage25 && <option value="max" disabled>{t('image2Options.qualityMaxPending')}</option>}
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-[11px] font-medium" style={labelStyle}>{t('image2Options.outputFormat')}</label>
          <select
            aria-label={t('image2Options.outputFormat')}
            name="image2OutputFormat"
            value={outputFormat}
            onChange={(event) => setOutputFormat(event.target.value as Image2OutputFormat)}
            className="nowheel w-full rounded-lg p-2 text-xs outline-none"
            style={selectStyle}
          >
            <option value="png">{t('image2Options.png')}</option>
            <option value="jpeg" disabled={options.background === 'transparent'}>{t('image2Options.jpeg')}</option>
            <option value="webp">{t('image2Options.webp')}</option>
          </select>
        </div>
      </div>

      {isImage25 && (
        <div className="space-y-2">
          <p className="text-[11px] leading-relaxed" style={labelStyle}>{t('image2Options.tips.quality25')}</p>
          <label className="block text-[11px] font-medium" style={labelStyle} htmlFor={backgroundId}>{t('image2Options.background')}</label>
          <select
            id={backgroundId}
            aria-label={t('image2Options.background')}
            name="image2Background"
            value={options.background ?? 'opaque'}
            onChange={(event) => setOption({ background: event.target.value as Image2Background })}
            className="nowheel w-full rounded-lg p-2 text-xs outline-none"
            style={selectStyle}
          >
            <option value="opaque">{t('image2Options.backgroundOpaque')}</option>
            <option value="transparent">{t('image2Options.backgroundTransparent')}</option>
            <option value="auto">{t('image2Options.backgroundAuto')}</option>
          </select>
          <p className="text-[11px] leading-relaxed" style={labelStyle}>{t('image2Options.tips.transparent25')}</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium" style={labelStyle}>{t('image2Options.responseFormat')}</label>
          <select
            value={options.responseFormat ?? 'b64_json'}
            onChange={(event) => setOption({ responseFormat: event.target.value as Image2ResponseFormat })}
            className="nowheel w-full rounded-lg p-2 text-xs outline-none"
            style={selectStyle}
          >
            <option value="b64_json">b64_json</option>
            <option value="url">url / data URL</option>
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-[11px] font-medium" style={labelStyle}>{t('image2Options.partialImages')}</label>
          <select
            value={partialImages}
            onChange={(event) => setOption({ partialImages: Number(event.target.value) })}
            className="nowheel w-full rounded-lg p-2 text-xs outline-none"
            style={selectStyle}
          >
            {[0, 1, 2, 3].map((count) => (
              <option key={count} value={count}>{t('image2Options.imageCount', { count })}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[11px] font-medium" style={labelStyle}>
          <span>{t('image2Options.compression')}</span>
          <span style={{ color: supportsCompression ? '#F2C14E' : '#5C4E3E' }}>
            {supportsCompression ? `${compression}%` : t('image2Options.compressionFormats')}
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          value={compression}
          disabled={!supportsCompression}
          onChange={(event) => setOption({ outputCompression: Number(event.target.value) })}
          className="nodrag nowheel w-full accent-[#F2C14E] disabled:opacity-30"
        />
      </div>
      </div>
    </details>
  );
}
