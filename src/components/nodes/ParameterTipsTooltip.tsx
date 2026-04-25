type ParameterTipsTooltipProps = {
  tips: string[];
};

const tooltipStyle = {
  background: 'rgba(20,18,16,0.98)',
  border: '1px solid rgba(242,193,78,0.18)',
  boxShadow: '0 18px 50px rgba(0,0,0,0.45)',
};

const tipStyle = { color: '#B8A07E' };

export function ParameterTipsTooltip({ tips }: ParameterTipsTooltipProps) {
  return (
    <div className="group relative inline-flex">
      <button
        type="button"
        aria-label="参数说明"
        title="参数说明"
        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold transition-colors hover:bg-[#F2C14E]/15 focus:outline-none focus:ring-1 focus:ring-[#F2C14E]/60"
        style={{
          background: 'rgba(242,193,78,0.08)',
          border: '1px solid rgba(242,193,78,0.24)',
          color: '#F2C14E',
        }}
      >
        ?
      </button>
      <div
        role="tooltip"
        className="invisible pointer-events-none absolute right-0 top-7 z-50 w-80 max-w-[calc(100vw-2rem)] rounded-xl p-3 opacity-0 backdrop-blur-md transition-opacity duration-150 group-hover:visible group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:visible group-focus-within:pointer-events-auto group-focus-within:opacity-100"
        style={tooltipStyle}
      >
        <div className="space-y-1.5">
          {tips.map((tip) => (
            <p key={tip} className="text-[10px] leading-relaxed" style={tipStyle}>
              {tip}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}
