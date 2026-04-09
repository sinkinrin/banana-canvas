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
    return <div className="w-full h-screen flex items-center justify-center bg-[#f8f9fa]">加载中...</div>;
  }

  if (!hasKey) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-[#f8f9fa] p-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full space-y-6">
          <div className="text-center">
            <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <Key size={32} />
            </div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">需要 API Key</h2>
            <p className="text-gray-600 text-sm">
              使用高质量图像生成模型需要提供 Google Cloud API Key。
            </p>
          </div>

          <button
            onClick={handleSelectKey}
            className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors shadow-lg shadow-blue-500/30"
          >
            使用官方安全授权 (推荐)
          </button>

          <div className="pt-4 border-t border-gray-100">
            <button 
              onClick={() => setShowManual(!showManual)}
              className="flex items-center justify-center gap-2 w-full text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              <span>或者手动输入 API Key</span>
              {showManual ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>

            {showManual && (
              <div className="mt-4 space-y-3 animate-in fade-in slide-in-from-top-2">
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex gap-2 text-amber-800 text-xs text-left">
                  <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                  <p>
                    <strong>安全警告：</strong> 手动输入的 Key 会直接保存在您的浏览器本地。请仅在信任的设备上使用，并注意不要泄露给陌生人。
                  </p>
                </div>
                <input
                  type="password"
                  value={manualKey}
                  onChange={(e) => setManualKey(e.target.value)}
                  placeholder="AIzaSy..."
                  className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
                <button
                  onClick={handleSaveManualKey}
                  disabled={!manualKey.trim()}
                  className="w-full py-2.5 px-4 bg-gray-800 hover:bg-gray-900 disabled:bg-gray-300 text-white rounded-xl font-medium transition-colors text-sm"
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
