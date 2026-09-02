# Changelog

本项目的用户可见变更记录在此文件中。版本号遵循 Semantic Versioning。

## [Unreleased]

## [0.3.1] - 2026-09-02

### 改进

- Banana 提供方从 Nano Banana 2 预览模型迁移到官方稳定模型 `gemini-3.1-flash-image`。
- 同步更新模型请求断言与用户文档，保留现有分辨率、宽高比、思考模式和搜索增强参数。

### 发布

- 这是内置更新器的 v0.3.0 客户端可自动接收的首个增量版本，继续通过 GitHub Releases 提供安装包、blockmap 与 `latest.yml`。

### 已知限制

- Windows 安装包暂未进行代码签名，安装和自动更新时可能出现 SmartScreen 未知发布者提示。

## [0.3.0] - 2026-09-02

### 新增

- 新增 QuickDraw 构图草图编辑器，可按当前画幅绘制人物位置、动作和画面关系。
- 草图以固定画幅 PNG 作为生成参考图，同时保存可继续编辑的 QuickDraw 快照。
- Windows 客户端会自动从 GitHub Releases 检查并后台下载稳定更新；下载完成后由用户选择立即重启或稍后安装。
- 项目列表和画布标题显示当前客户端版本。

### 改进

- 同一创作节点再次应用草图时原位替换旧草图参考，不重复占用参考图名额。
- Electron smoke test 覆盖草图绘制、应用为参考图和重新打开编辑。
- 升级存在安全公告的传递依赖，并保持 npm audit 为零漏洞。

### 发布

- 新增版本号、README、lockfile 和 Changelog 一致性门禁。
- 新增 tag 驱动的 Windows 构建、已打包程序 smoke、更新元数据校验、SHA256 清单和 GitHub Release 发布流程。
- GitHub Release 同时发布 NSIS 安装包、blockmap、`latest.yml` 和 `SHA256SUMS.txt`。

### 已知限制

- Windows 安装包暂未进行代码签名，安装和自动更新时可能出现 SmartScreen 未知发布者提示。
- v0.2.1 不包含更新器，需要手动安装一次 v0.3.0；从 v0.3.0 开始才能接收后续自动更新。

## [0.2.1] - 2026-07-23

### 新增

- 新增 Electron Windows 桌面版与 NSIS 安装支持。
- 新增应用内模型连接设置、运行时热更新和系统安全存储。
- 加入 CI、ESLint、Electron smoke test 与 Windows 构建脚本。

### 改进

- 改进 Image2 请求、代理、取消、校验与生成结果处理。
- 增强本地项目资产持久化与可恢复删除。

[Unreleased]: https://github.com/sinkinrin/banana-canvas/compare/v0.3.1...HEAD
[0.3.1]: https://github.com/sinkinrin/banana-canvas/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/sinkinrin/banana-canvas/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/sinkinrin/banana-canvas/releases/tag/v0.2.1
