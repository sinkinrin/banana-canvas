# Banana Canvas 项目协作说明

## 发布约定

- 开始发布相关工作前，完整阅读 `docs/RELEASING.md`。
- 当用户明确要求发布版本时，采用直接发布模式：本地复审和验证后推送 `main`，等待 CI 全绿，再创建并推送 `v<version>` tag；无需 PR，也不要手工提前创建 GitHub Release。
- `package.json` 是唯一版本源；`package-lock.json`、README 当前版本、Changelog 标题、tag 和 `latest.yml` 必须一致。
- 已发布的 tag 绝不覆盖或移动；发布后发现问题时递增 patch 版本。
- Windows 安装包当前未签名。发布说明和更新确认框必须保留 SmartScreen/未知发布者提示，不得声称安装包已签名。
- 自动更新策略是后台下载，下载完成后由用户确认是否立即重启安装。

## 发布门禁

依次执行并确认成功：

```bash
npm ci
npm run check
npm audit --audit-level=high
npm run smoke:electron
npm run dist:win
npm run smoke:electron:packaged
npm run release:prepare -- v<version>
git diff --check
```

提交发布前复审完整 diff，并核对安装包版本与未签名状态。推送 `main` 后必须等待 Ubuntu 与 Windows CI 成功，才能推送 tag。推送 tag 后等待 Release workflow 成功，并确认 GitHub Release 包含安装包、blockmap、`latest.yml` 和自动生成的 `SHA256SUMS.txt`；最后在线核对 `latest.yml` 的版本，确保旧客户端可发现更新。

## SHA 与缓存约定（用户明确要求）

- 禁止代理额外手动执行 SHA256/SHA512 计算、比对或重复校验；不得为了校验 SHA 再次下载本地或远端安装包，不再把手动 SHA 校验当作发布门禁。
- 保留 Electron 下载工具自身的完整性校验、electron-builder/electron-updater 必需的校验元数据，以及 `release:prepare` 自动生成校验清单的现有行为；这些由工具自动处理，代理不要再额外计算或比对一遍。
- 本地打包复用锁定版本的 Electron 缓存和已安装 Electron 包自带的校验清单，不为缓存命中重复联网下载校验清单。
- CI 缓存 Electron 和 electron-builder 工具，按操作系统、架构及工具版本区分；不要因应用版本变化或重试构建而主动清空缓存。

不要把 API Key、GitHub token 或其他凭据写入仓库、日志或回复。
