export type DesktopWindowState = { maximized: boolean };

export type DesktopWindowBridge = {
  getState: () => Promise<DesktopWindowState>;
  minimize: () => Promise<void>;
  toggleMaximize: () => Promise<void>;
  close: () => Promise<void>;
  subscribe: (listener: (state: DesktopWindowState) => void) => () => void;
};

export function getDesktopWindowBridge() {
  return (globalThis as typeof globalThis & { bananaDesktop?: { window?: DesktopWindowBridge } })
    .bananaDesktop?.window;
}
