export type NativeAppLanguage = 'en' | 'zh-CN';

export function normalizeNativeAppLanguage(language: string | null | undefined): NativeAppLanguage {
  return language?.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en';
}

export function getNativeAppMessages(language: string | null | undefined) {
  if (normalizeNativeAppLanguage(language) === 'zh-CN') {
    return {
      appName: '香蕉画图',
      updateReadyTitle: '香蕉画图更新已就绪',
      updateDownloaded: (version: string) => `版本 ${version} 已在后台下载完成`,
      restartDetail: '是否立即重启并安装？选择“稍后”会在退出应用后自动安装。',
      unsignedDetail: '当前安装包未进行代码签名，Windows 可能显示安全提示。',
      installNow: '立即重启并安装',
      later: '稍后',
      startupFailed: '香蕉画图启动失败',
      checkBeforeDownload: '请先检查更新，确认有可用的新版本。',
      updateNotDownloaded: '更新尚未下载完成。',
    };
  }

  return {
    appName: 'Banana Canvas',
    updateReadyTitle: 'Banana Canvas update ready',
    updateDownloaded: (version: string) => `Version ${version} was downloaded in the background`,
    restartDetail: 'Restart and install now? Choose “Later” to install automatically after you exit the app.',
    unsignedDetail: 'The installer is not code-signed. Windows may show a security warning.',
    installNow: 'Restart & install',
    later: 'Later',
    startupFailed: 'Banana Canvas failed to start',
    checkBeforeDownload: 'Check for updates first and confirm that a new version is available.',
    updateNotDownloaded: 'The update has not finished downloading.',
  };
}
