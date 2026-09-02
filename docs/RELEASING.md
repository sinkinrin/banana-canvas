# Banana Canvas 发布流程

Banana Canvas 采用直接发布模式：维护者在本地完成复审和全套验证，把发布提交推送到 `main`，再推送对应的 `v<version>` tag。无需 Release PR，也不要手工创建 GitHub Release。

## 版本规则

- 使用 Semantic Versioning，`package.json` 是唯一版本源。
- `package-lock.json`、README 当前版本、Changelog 版本标题和 Git tag 必须一致。
- 新功能提升 minor，兼容修复提升 patch；首个 QuickDraw 版本为 `0.3.0`。
- 已推送的 tag 不覆盖、不移动。发布后发现问题时创建新的 patch 版本。

## 本地发布门禁

在干净的 `main` 上完成版本和 Changelog 更新，然后执行：

```bash
npm ci
npm run check
npm audit
npm run dist:win
npm run smoke:electron:packaged
npm run release:prepare -- v<version>
```

`release:prepare` 会确认 tag、package、lockfile、README、Changelog 和 `latest.yml` 一致，并为安装包、blockmap 与更新元数据生成 `SHA256SUMS.txt`。

确认差异和产物后提交并推送：

```bash
git push origin main
git tag v<version>
git push origin v<version>
```

## GitHub Actions 发布

`.github/workflows/release.yml` 只响应 `v*` tag，并在 `windows-latest` 上从该 tag 重新执行：

1. `npm ci`、版本门禁、类型检查、Lint、测试和构建。
2. 生产依赖安全审计。
3. Windows NSIS 打包和已打包客户端 smoke。
4. `latest.yml`、blockmap、安装包与 SHA256 校验。
5. 上传短期 Actions artifact。
6. 最后一步创建 GitHub Release 并一次性上传所有客户端更新资产。

Release 在所有验证完成前不会出现，避免客户端读到只有安装包、没有更新元数据的不完整版本。

## 自动更新资产

每个稳定 Release 必须包含：

- `banana-canvas-setup-<version>.exe`
- `banana-canvas-setup-<version>.exe.blockmap`
- `latest.yml`
- `SHA256SUMS.txt`

`electron-builder` 的 GitHub provider 固定为 `sinkinrin/banana-canvas`。构建脚本显式使用 `--publish never`，防止本地打包或 CI 构建阶段提前上传；只有 Release workflow 的最后一步拥有 `contents: write` 权限。

## 未签名发布说明

当前没有 Windows 代码签名证书。发布流程允许未签名安装包，但 Release Notes 和客户端更新确认框必须说明 SmartScreen 风险。不要向用户声称安装包具有发布者身份验证。

v0.2.1 没有内置更新器，用户必须手动安装 v0.3.0；此后稳定版本才会后台下载并在用户确认后重启安装。
