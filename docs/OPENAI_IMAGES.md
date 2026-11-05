# OpenAI 官方格式图片 Provider

在 **应用设置 → 模型与连接 → OpenAI 官方格式（满血版）** 中配置独立的 Base URL、API Key、代理和超时。默认 Base URL 为 `https://api.openai.com/v1`，也可使用实现相同协议的自定义服务。桌面版 Key 使用 Electron `safeStorage` 保存；设置接口只返回是否已配置。

旧 CPA 连接与模型 ID 保留，显示名称增加“残血版”。新增官方通道模型显示“满血版”，包括 Image2、Image 2.5 Flare/Sunburst、Image 2.6 Flare/Sunburst。“满血版”表示应用开放对应模型的官方参数，实际权限、限额和预览功能仍由所连接服务决定。

## 请求与参数

- 生成：`POST /v1/images/generations`，JSON 请求。
- 本地参考图编辑：`POST /v1/images/edits`，标准 multipart `image[]`；源图、`mask`、`markup` 分别上传。
- HTTPS URL、base64 data URL、File ID 或混合输入：官方 JSON `images` 数组。高级参数中每行填写一个 URL 或 `file-…`。每个引用必须只指定 `image_url` 或 `file_id`。
- 新连接不会调用 Chat Completions，不会回退到 CPA。启用专用代理后只走该代理，不回退直连，也不进行重复生图竞速。

| 参数 | 支持方式 |
| --- | --- |
| `quality` | Image2：auto/low/medium/high；2.5/2.6 增加 xhigh/max |
| `complexity` | 2.6 的 low/medium/high；与渲染质量独立 |
| `size` | 画布预设、auto、自定义 WIDTHxHEIGHT；常规图片按 16 倍数、边长、比例和总像素校验 |
| `background` | auto/opaque/transparent；透明背景使用 PNG/WebP |
| `output_format` | PNG/JPEG/WebP；2.6 另有 SVG/GIF 生成 |
| `output_compression` | JPEG/WebP 的 0–100 |
| `moderation` | auto/low |
| `n` | 1–10；全部结果各自成为画布节点；SVG 限 1 |
| `stream`、`partial_images` | 逐事件传递中间预览，只有 completed 才作为最终结果；可取消 |
| `mask`、`markup` | 蒙版或透明 PNG 批注层，作用于第一张原图，不能组合；批注适用于 2.5/2.6 |
| `frame_count`、`frame_duration_ms` | GIF 帧数和帧间隔，GIF 预览权限由服务控制 |
| `svg.model`、`svg.reasoning.effort` | 已开放 SVG 作者模型选择时配置；保留独立 svg_usage |
| `safety_identifier` | 可选稳定匿名标识，最多 128 字符；不要填写个人敏感信息 |

GPT Image 官方通道不发送旧版 `response_format`、`style`，也不发送这些模型不支持的 `input_fidelity`。SVG/GIF 仅用于生成，不用于编辑；不支持上游流式、局部预览或压缩率。SVG 原始 XML 和 GIF 动画原字节会保存到项目并以正确扩展名下载，预览使用图片元素，不将 SVG 插入页面 DOM。

一次请求 `n` 和画布“批次数”相乘。对比模式通常应保持 `n=1`，以便每个模型一张。每张新增结果保留请求参数和同一次请求的用量信息；用量属于整个请求，不是单图分摊费用。

## 输入限制

官方通道最多 16 张参考图，提示词最多 32000 字符。本地上传单图上限 50 MiB；JSON `image_url` 字段长度另受官方 20 MiB 字符限制。SVG 不是官方编辑的栅格输入；动画 GIF 作为参考时只使用首帧。蒙版与原图应同尺寸并包含透明通道；批注 PNG 必须与首张原图方向校正后的尺寸一致且包含透明像素，原图和批注各不超过 16,777,216 像素。

旧 CPA / Banana 通道仍使用原有 4 张、单张 16 MiB、合计 40 MiB 限制。切回参考数量更少的模型时，界面要求先移除多余参考图。

## 官方文档差异与实测

2026-11-05，所有官方网络测试显式通过 `http://127.0.0.1:7890` 完成：

- 模型列表 HTTP 200，包含 2.6 Flare 和 Sunburst。
- Flare：生成 1024×1024 PNG。
- Sunburst：multipart 原图与独立批注层编辑，官方回报 xhigh，返回 1024×1024 透明 WebP，收到 2 次局部预览；已检查实际 alpha 通道。
- GIF：生成 512×512、2 帧、每帧 100 ms 动画，已解码确认帧数与时长。
- SVG：该测试账号不填写 svg.model 时返回 missing_required_parameter；填写 gpt-5.4-mini 后成功，返回原始 SVG 和单独的 svg_usage。其他账号是否需要作者参数由服务权限决定。
- GIF 指南写 2–64 帧，API 参数页写 2–16 帧。实测 17 帧返回 HTTP 400 / invalid_value，明确要求 2–16。应用保留指南参数范围与服务错误信息，界面注明当前实际限制。

测试凭据不包含在版本产物或配置模板中；首次使用官方通道需自行配置 Key。

## 官方依据

- [图片生成指南](https://developers.openai.com/api/docs/guides/image-generation)
- [生成接口](https://developers.openai.com/api/reference/resources/images/methods/generate)
- [编辑接口](https://developers.openai.com/api/reference/resources/images/methods/edit)
- [GPT Image 2.6 Flare](https://developers.openai.com/api/docs/models/gpt-image-2.6-flare)
- [GPT Image 2.6 Sunburst](https://developers.openai.com/api/docs/models/gpt-image-2.6-sunburst)
