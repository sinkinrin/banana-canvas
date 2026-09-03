# Changelog

本项目的用户可见变更记录在此文件中。版本号遵循 Semantic Versioning。

## [Unreleased]

## [0.6.0] - 2026-09-03

### 新增

- 应用界面新增 English / 简体中文切换，首次启动跟随系统语言，并在本机记住用户选择。

### 改进

- 将界面文案集中到类型一致的 i18n 资源，覆盖项目、画布、节点、提示词库、设置、更新、蒙版与构图草图流程。
- 提示词优化默认改用正式版 `gemini-3.8-flash`，并支持在应用设置或 `.env` 中自定义模型。

### 文档

- 默认 README 改为精简英文首页并高亮中文入口；新增 `README_CN.md`，把配置与开发细节拆分到独立文档。

## [0.5.1] - 2026-09-03

### 改进

- 参考图单张上限由 10 MiB 提高到 16 MiB，图片合计上限由 32 MiB 提高到 40 MiB，并将本地 JSON 请求体上限配套提高到 64 MiB。
- Windows 桌面端移除默认 Electron 菜单栏，让应用界面保持简洁一致。

### 修复

- 上传或粘贴参考图时会在读取前检查体积并显示文件名、实际大小和允许上限；服务端也会准确区分图片过大与 Base64 数据无效，不再显示误导性错误。

### 已知限制

- Windows 安装包暂未进行代码签名，安装和自动更新时可能出现 SmartScreen 未知发布者提示。

## [0.5.0] - 2026-09-02

### 新增

- 设置中新增 Banana / Gemini 独立代理开关与代理 URL；默认直连，开启后同时用于 Banana 系列生图和 Gemini 提示词优化，不影响 Image2 的代理模式。
- 新增跨项目提示词库，支持标题、内容、标签、搜索、新建、编辑、复制、删除、收藏当前提示词，以及一键填入或创建创作节点。
- 设置新增“软件更新”页，可手动检查线上最新版本、查看更新日志、下载进度并主动重启安装；自动更新改为默认关闭，由用户显式开启。

### 修复

- 修复生成结果“重新生成”点击后缺少可见响应的问题；结果动作统一隔离 React Flow 拖拽手势，并为重新生成和复制失败补充明确状态反馈。

### 发布

- Windows 打包阶段会把当前版本 Changelog 和未签名提示写入 `latest.yml`，Release 门禁会拒绝缺少客户端更新日志的元数据。

## [0.4.0] - 2026-09-02

### 新增

- 生图模型选择新增 Banana 2 Lite（`gemini-3.1-flash-lite-image`）与 Banana Pro（`gemini-3-pro-image`），并在生成结果、重新生成和“以此为参考”链路中保留所选变体。
- 为三个 Banana 变体加入统一能力矩阵，按模型动态提供画幅、输出尺寸、思考等级、参考图解析和 Google Search 选项。

### 改进

- 修复 Windows 桌面端生成图片无法复制的问题：通过隔离的 Electron 原生剪贴板桥接写入 JPEG/PNG 等图片，并在失败时给出可见提示。
- Banana 2 Lite 固定输出 1K，但开放官方支持的 14 种比例与 `MINIMAL` / `HIGH` 思考等级，并自动过滤不支持的 Google Search。
- Banana Pro 提供 1K、2K、4K、10 种标准比例与 Google Search；思考由模型管理，并自动过滤会触发 API 400 的 `mediaResolution`。
- 模型切换、前端请求和服务端校验都会规范化不兼容的旧节点参数；Banana Pro 请求超时提高到 5 分钟。
- 使用 Gemini Models API 与实际生图请求验证三个稳定模型；Lite 的极端画幅/高思考、Lite/常规版的参考图解析及 Pro 的参考图生成均通过。

### 调研

- 评估 Google 已全面推出的 Interactions API。它的服务端多轮状态、执行步骤和后台任务对连续编辑与 Pro 长任务有价值，但当前存在 SDK 大版本迁移、默认云端存储、自定义安全设置缺失及 Lite 未列入支持表等差异，本版继续使用官方仍完整支持的 `generateContent`。

### 已知限制

- Windows 安装包暂未进行代码签名，安装和自动更新时可能出现 SmartScreen 未知发布者提示。

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

[Unreleased]: https://github.com/sinkinrin/banana-canvas/compare/v0.6.0...HEAD
[0.6.0]: https://github.com/sinkinrin/banana-canvas/compare/v0.5.1...v0.6.0
[0.5.1]: https://github.com/sinkinrin/banana-canvas/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/sinkinrin/banana-canvas/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/sinkinrin/banana-canvas/compare/v0.3.1...v0.4.0
[0.3.1]: https://github.com/sinkinrin/banana-canvas/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/sinkinrin/banana-canvas/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/sinkinrin/banana-canvas/releases/tag/v0.2.1
