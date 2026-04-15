import React from 'react';

type PromptTextareaProps = {
  value: string;
  isLoading?: boolean;
  onDraftChange: (value: string) => void;
  onCommit: (value: string) => void;
  onSubmit: (value: string) => void;
  onPaste?: React.ClipboardEventHandler<HTMLTextAreaElement>;
};

export function PromptTextarea({
  value,
  isLoading = false,
  onDraftChange,
  onCommit,
  onSubmit,
  onPaste,
}: PromptTextareaProps) {
  return (
    <textarea
      value={value}
      onPaste={onPaste}
      onChange={(event) => {
        onDraftChange(event.target.value);
      }}
      onBlur={(event) => {
        event.target.style.borderColor = 'rgba(242,193,78,0.15)';
        onCommit(event.currentTarget.value);
      }}
      onKeyDown={(event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
          event.preventDefault();
          const currentValue = event.currentTarget.value;
          if (currentValue.trim() && !isLoading) {
            onSubmit(currentValue);
          }
        }
      }}
      placeholder="描述你想生成的画面... (支持 Ctrl+V 粘贴图片，Ctrl+Enter 生成)"
      className="nodrag nowheel w-full h-32 p-3 pb-10 rounded-xl resize-none outline-none text-sm transition-all placeholder-[#5C4E3E]"
      style={{background: '#141210', border: '1px solid rgba(242,193,78,0.15)', color: '#EEE4CE', caretColor: '#F2C14E'}}
      onFocus={event => event.target.style.borderColor = 'rgba(242,193,78,0.45)'}
    />
  );
}
