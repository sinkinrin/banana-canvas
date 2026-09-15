# 多模型对比与结果信息 / Model comparison

Available from v0.9.0.

## 使用

1. 在创作节点填写提示词，按需添加参考图。
2. 点击“多模型对比”，勾选至少两款模型。默认选中 Image 2.5 Flare、Sunburst。
3. 选择所有模型均支持的画幅和分辨率。包含 Banana 2 Lite 时，共用分辨率限制为 1K。
4. 点击“开始对比生成”。每个模型各生成一张，使用相同提示词与参考图；高级参数按模型支持情况处理，生成数量设置不额外乘到对比请求上。
5. 在对比窗口同步缩放、拖动观察。可标记一个最佳方案，再次点击可以取消。关闭窗口不会删除结果。
6. 结果在画布上横向排列。通过图片节点“查看对比”重新打开整组；图片、模型、生成参数、信息卡与最佳标记随项目保存。

每个模型的请求可能分别计费。模型需要相应连接和权限；单个模型失败不会删除其他成功结果。可关闭对比窗口，在创作节点取消未完成的生成；切换离开项目也会取消未完成请求。无法保证上游已经开始的生成不计费。

## 信息卡

- 实际尺寸来自浏览器对图片的解码，实际格式来自返回图片的数据类型，不使用请求尺寸代替实测尺寸。
- 生成耗时由本机服务端测量，包含模型请求和结果读取。
- “请求的 API 模型”是实际发送给提供方的名称；“服务器回报型号”只展示服务端返回值，不独立证明底层模型。
- 请求与回报画质分别记录；服务器没有提供的数据和旧图片没有记录的数据，明确显示“未记录”。
- 原图编辑、重新生成和对比生成均可记录信息；重新生成会清除该图片旧的最佳标记。

图像生成 API 增加可选 `includeGenerationInfo: true` 请求字段。启用后响应额外包含经过字段筛选的 `generationInfo`，旧调用仍可仅使用 `imageUrl`。元数据不会包含 Key、完整上游响应或推断费用。

## Server model list

In App settings → Models & connection, use **View models** to fetch the saved relay's standard `/v1/models` catalog. Refresh after saving URL or Key changes. Model IDs and provider names are searchable. This is a catalog viewer; listed text models are not implicitly enabled as image generators.

Requests run on the local server, use the configured direct/proxy policy, and time out after 20 seconds. Credentials are never returned to the renderer or forwarded across HTTP redirects. Upstream errors are represented by a bounded error code and HTTP status, not raw error bodies.

## 验证记录

2026-09-15 使用现有连接读取到 19 个模型。通过项目对比流程向 Flare、Sunburst 发起相同提示词的真实请求，两款均返回图片，并取得 API 模型、耗时、请求及回报画质/尺寸。该次请求 `medium / 1024x1024`，两款均回报 `low / 1774x887`，信息卡按原值展示。

本地 Electron 检查覆盖两模型选择、并排结果、同步缩放、最佳标记、保存重开、信息卡实际尺寸和模型列表搜索；后端回归覆盖模型列表鉴权、重定向拒绝、错误脱敏和元数据传递。
