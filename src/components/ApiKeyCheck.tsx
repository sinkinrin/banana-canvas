import { useEffect, useState, ReactNode } from 'react';
import { Key, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';

declare global {
  interface Window {
    aistudio?: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

export function ApiKeyCheck({ children }: { children: ReactNode }) {
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [manualKey, setManualKey] = useState('');

  useEffect(() => {
    const checkKey = async () => {
      // Check if user has manually provided a key
      if (localStorage.getItem('custom_gemini_api_key')) {
        setHasKey(true);
        return;
      }

      if (window.aistudio?.hasSelectedApiKey) {
        const selected = await window.aistudio.hasSelectedApiKey();
        setHasKey(selected);
      } else {
        // Fallback if running outside AI Studio
        setHasKey(true);
      }
    };
    checkKey();
  }, []);

  const handleSelectKey = async () => {
    if (window.aistudio?.openSelectKey) {
      await window.aistudio.openSelectKey();
      // Assume success to mitigate race condition
      setHasKey(true);
    }
  };

  const handleSaveManualKey = () => {
    if (manualKey.trim().startsWith('AIza')) {
      localStorage.setItem('custom_gemini_api_key', manualKey.trim());
      setHasKey(true);
    } else {
      alert('请输入有效的 Gemini API Key (通常以 AIza 开头)');
    }
  };

  if (hasKey === null) {
    return (
      <div className="w-full h-screen flex items-center justify-center" style={{background: '#16130F'}}>
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin" style={{borderColor: 'rgba(242,193,78,0.6)', borderTopColor: 'transparent'}} />
          <span style={{color: '#96836F', fontFamily: 'system-ui'}}>加载中...</span>
        </div>
      </div>
    );
  }

  if (!hasKey) {
    return (
      <div className="w-full h-screen flex items-center justify-center p-4 relative overflow-hidden" style={{background: '#16130F'}}>
        {/* Atmospheric radial glow */}
        <div className="absolute inset-0 pointer-events-none" style={{background: 'radial-gradient(ellipse 60% 50% at 50% 50%, rgba(242,193,78,0.06) 0%, transparent 70%)'}} />
        {/* Subtle grid lines */}
        <div className="absolute inset-0 pointer-events-none opacity-[0.03]" style={{backgroundImage: 'linear-gradient(rgba(242,193,78,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(242,193,78,0.5) 1px, transparent 1px)', backgroundSize: '60px 60px'}} />

        <div className="relative w-full max-w-[400px] rounded-2xl p-8 space-y-6" style={{background: '#1D1A14', border: '1px solid rgba(242,193,78,0.2)', boxShadow: '0 0 80px rgba(242,193,78,0.05), 0 24px 64px rgba(0,0,0,0.6)'}}>
          {/* Golden top accent line */}
          <div className="absolute top-0 left-8 right-8 h-px rounded-full" style={{background: 'linear-gradient(90deg, transparent, #F2C14E, transparent)'}} />

          <div className="text-center space-y-3">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto" style={{background: 'linear-gradient(135deg, #F2C14E, #D97B3A)', boxShadow: '0 8px 24px rgba(242,193,78,0.3)'}}>
              <Key size={28} color="#16130F" />
            </div>
            <div>
              <h2 className="text-xl font-bold" style={{color: '#EEE4CE'}}>需要 API Key</h2>
              <p className="text-sm mt-1.5 leading-relaxed" style={{color: '#96836F'}}>使用 Gemini 高质量图像生成模型需要提供 Google Cloud API Key</p>
            </div>
          </div>

          <button
            onClick={handleSelectKey}
            className="w-full py-3 px-4 rounded-xl font-medium transition-all hover:scale-[1.02] active:scale-[0.98]"
            style={{background: 'linear-gradient(135deg, #F2C14E, #D97B3A)', color: '#16130F', boxShadow: '0 4px 16px rgba(242,193,78,0.25)'}}
          >
            使用官方安全授权（推荐）
          </button>

          <div style={{borderTop: '1px solid rgba(242,193,78,0.1)'}} className="pt-4">
            <button
              onClick={() => setShowManual(!showManual)}
              className="flex items-center justify-center gap-2 w-full text-sm transition-colors"
              style={{color: showManual ? '#F2C14E' : '#96836F'}}
            >
              <span>或者手动输入 API Key</span>
              {showManual ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>

            {showManual && (
              <div className="mt-4 space-y-3">
                <div className="p-3 rounded-xl flex gap-2 text-xs text-left" style={{background: 'rgba(217,123,58,0.1)', border: '1px solid rgba(217,123,58,0.25)', color: '#D97B3A'}}>
                  <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                  <p><strong>安全提示：</strong>手动输入的 Key 会保存在浏览器本地，请在可信设备上使用。</p>
                </div>
                <input
                  type="password"
                  value={manualKey}
                  onChange={(e) => setManualKey(e.target.value)}
                  placeholder="AIzaSy..."
                  className="w-full p-3 rounded-xl text-sm outline-none transition-all"
                  style={{background: '#141210', border: '1px solid rgba(242,193,78,0.2)', color: '#EEE4CE', caretColor: '#F2C14E'}}
                  onFocus={e => e.target.style.borderColor = 'rgba(242,193,78,0.5)'}
                  onBlur={e => e.target.style.borderColor = 'rgba(242,193,78,0.2)'}
                />
                <button
                  onClick={handleSaveManualKey}
                  disabled={!manualKey.trim()}
                  className="w-full py-2.5 px-4 rounded-xl font-medium text-sm transition-all"
                  style={{
                    background: manualKey.trim() ? 'rgba(242,193,78,0.15)' : 'rgba(255,255,255,0.04)',
                    border: '1px solid',
                    borderColor: manualKey.trim() ? 'rgba(242,193,78,0.35)' : 'rgba(255,255,255,0.06)',
                    color: manualKey.trim() ? '#F2C14E' : '#5C4E3E',
                    cursor: manualKey.trim() ? 'pointer' : 'not-allowed'
                  }}
                >
                  保存并继续
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
