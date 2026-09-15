# Image 2.5

Available from v0.8.0. Backend checks performed on 2026-09-15.

## Choosing a model / 选择模型

| Canvas option | Exact API model | Intended use |
| --- | --- | --- |
| Image 2.5 Flare | `gpt-image-2.5-flare` | Fast everyday image generation / 快速日常出图 |
| Image 2.5 Sunburst | `gpt-image-2.5-sunburst` | Editing precision / 精确参考图与局部编辑 |
| Image2 | Model configured in App settings | Existing projects and custom relays / 原有项目与自定义中转 |

Configure the existing Image2 URL and Key in App settings, then choose a 2.5 variant on a creation node. Both explicit variants use `/v1/images/generations` or `/v1/images/edits`. Saved projects, references, reruns, and mask edits preserve the variant. Mask editing from a Banana node continues to use the configured Image2 model.

在“应用设置”配置现有 Image2 地址和 Key，再在创作节点选择 2.5 型号即可。新选项不会更改原有项目的模型或连接配置；不会使用中转站含义未明确的 `gpt-image-2.5` 别名。

## Transparent assets / 透明素材

Select **Background → transparent** and use PNG or WebP. Selecting transparency with JPEG switches to PNG; incompatible compression is removed. Generated transparent assets have a checkerboard preview and can be downloaded or used as references.

选择“背景 → transparent 透明”，使用 PNG 或 WebP。JPEG 不支持透明通道，选择透明背景时会自动切换为 PNG；项目保存、重开和继续作为参考图时保留透明背景选项。

## Backend verification / 后端实测

Authenticated requests used the existing desktop application's connection to `api.akemi.cc`. No credentials or private input images are included here. Six requests used generated star stickers: generation, reference editing, and mask editing for each model name. This checks the relay's observable behavior; responses did not identify the upstream model, so they do not independently prove the upstream weights or model mapping.

| Request | Requested quality | HTTP | Reported quality | Result |
| --- | --- | --- | --- | --- |
| Flare generation | `xhigh` | 200 | `medium` | PNG with alpha |
| Sunburst generation | `max` | 200 | `medium` | PNG with alpha |
| Flare reference edit | `max` | 200 | `medium` | PNG with alpha |
| Sunburst reference edit | `xhigh` | 200 | `medium` | PNG with alpha |
| Flare mask edit | `high` | 200 | `medium` | PNG with alpha |
| Sunburst mask edit | `high` | 200 | `medium` | PNG with alpha |

- Generation and reference-edit images were RGBA, with alpha spanning 0–255: transparency exists in the actual files, not just response metadata.
- `1024x1024` was requested; the generation and reference-edit images were `1254x1254`. Requested dimensions are targets, not verified exact output dimensions.
- Edit requests included `stream=true` and `partial_images=1`. The response content type was `text/event-stream`, but the body was JSON and no partial-image events were observed. The existing provider handles this final-image response.
- `xhigh`, `max`, and the mask requests' `high` all reported `medium`. HTTP success therefore does not establish that the requested quality was honored. The new `xhigh` / `max` controls remain disabled; existing quality controls remain available as request parameters.
- A successful mask request verifies API acceptance and image return, not pixel-exact preservation of every unmasked region.

Two additional requests ran through the updated project's client payload, local generation route, and real provider: Flare generation and Sunburst mask editing. Both returned HTTP 200, retained the selected UI model, and produced RGBA files with actual transparent pixels. They requested WebP but returned PNG; the provider correctly identified the PNG data. The Flare result measured 1263×1246, while the Sunburst edit measured 1254×1254. WebP encoding by this relay is therefore not verified and should not be advertised as implemented.

两款模型名称均能成功请求生图、参考图编辑和蒙版编辑，透明 PNG 已检查实际像素。但后端还没有证实完整实现所有 2.5 参数：新画质请求回报 `medium`、实际尺寸与请求不一致，流式请求也未返回局部图事件。界面保留这些限制的说明，不把 HTTP 200 等同于全部特性生效。

修改后的项目调用链额外完成了两次真实请求，均成功；请求 WebP 仍返回 PNG，因此不宣称后端已实现 WebP 编码。项目按实际图片内容识别格式并保存。

An additional prompt comparison kept `quality=max` and all other parameters fixed. For both variants, the ordinary poster prompt returned `medium` (915 output tokens), while adding “think deeply, plan and check before generating” returned `low` (515 output tokens). All four requests succeeded and produced 1254×1254 PNGs, with no reasoning-token or thinking-mode fields. One sample per condition does not establish causality or actual internal reasoning, and the wording did not yield evidence of the requested `max` tier.

补充对照中，两款模型的普通海报提示词均回报 `medium`；加上“深度思考、规划、核对再生成”后均回报 `low`，并未获得 `max` 的证据。每组仅一次，不据此断言这类措辞会降低实际画质；应用不会自动添加该前缀。

Before enabling `xhigh` / `max`, verify the relay's parameter validation and forwarding, then repeat generation and editing checks and inspect returned metadata. Before advertising exact dimensions or live previews, verify actual image dimensions and real SSE events. Backend availability can change after this dated check.

## Official capabilities / 官方能力

OpenAI documents `low`, `medium`, `high`, `xhigh`, `max`, and `auto` for both variants, plus transparent PNG/WebP. Custom dimensions must be multiples of 16, have a 1:3–3:1 aspect ratio, have no edge above 3840 pixels, and total 655,360–8,294,400 pixels. Resolutions above 2560×1440 are experimental. These official limits do not establish a relay's implementation.

Both variants have the same official token rates as GPT Image 2, but cost per image can vary with token consumption. Relay billing and the upstream mapping were not verified. Exact text placement, repeated-character consistency, and mask boundaries still require visual checking.

- [OpenAI Sunburst model documentation](https://developers.openai.com/api/docs/models/gpt-image-2.5-sunburst)
- [OpenAI Flare model documentation](https://developers.openai.com/api/docs/models/gpt-image-2.5-flare)
- [OpenAI image generation guide](https://developers.openai.com/api/docs/guides/image-generation)
