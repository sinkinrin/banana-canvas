import { useEffect, useState } from 'react';
import { Copy, Minus, Square, X } from 'lucide-react';
import { useAppTranslation } from '../i18n';
import { getDesktopWindowBridge, type DesktopWindowBridge } from '../lib/desktopWindow';

export function DesktopTitleBar({ bridge = getDesktopWindowBridge() }: { bridge?: DesktopWindowBridge }) {
  const { t } = useAppTranslation();
  const [maximized, setMaximized] = useState(false);
  useEffect(() => {
    if (!bridge) return;
    let disposed = false;
    const unsubscribe = bridge.subscribe(state => { if (!disposed) setMaximized(state.maximized); });
    void bridge.getState().then(state => { if (!disposed) setMaximized(state.maximized); });
    return () => { disposed = true; unsubscribe(); };
  }, [bridge]);
  if (!bridge) return null;

  const maximizeLabel = t(maximized ? 'window.restore' : 'window.maximize');
  return (
    <header className="desktop-titlebar" data-desktop-titlebar="true">
      <div className="desktop-titlebar-drag"><span>{t('app.name')}</span></div>
      <div className="desktop-window-controls">
        <button type="button" data-window-action="minimize" aria-label={t('window.minimize')} title={t('window.minimize')} onClick={() => void bridge.minimize()}><Minus size={14} /></button>
        <button type="button" data-window-action="maximize" aria-label={maximizeLabel} title={maximizeLabel} onClick={() => void bridge.toggleMaximize()}>{maximized ? <Copy size={12} /> : <Square size={12} />}</button>
        <button type="button" data-window-action="close" aria-label={t('window.close')} title={t('window.close')} onClick={() => void bridge.close()}><X size={16} /></button>
      </div>
    </header>
  );
}
