<div align="center">
  <img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# 香蕉画图

当前版本：`0.1.0`

一个类似 Flowith 的无限画布 AI 图像生成工具。你可以在画布上搭建提示词节点和图片节点，把一轮生成的结果继续作为下一轮参考图，逐步迭代出更复杂的视觉方案。

AI Studio 应用入口：
https://ai.studio/apps/5748be9b-3523-4bad-a3fa-e138965b1069

## 核心功能

- 无限画布工作流：基于 React Flow 搭建，可在画布上自由摆放、连线、缩放和整理节点。
- 创作节点：输入提示词后可直接生成图片，也可以先用 Gemini 3.1 Pro 优化提示词。
- 参考图输入：支持上传图片和 `Ctrl+V` 粘贴图片，单节点最多挂载 4 张参考图。
- 多参数生图：支持调整画幅比例、输出尺寸、单次生成数量、节点颜色，以及模型专属高级参数。
- 多模型生图：每个创作节点都可以选择 `Banana` 或 `Image2`，生成出的图片节点会记录当次使用的模型。
- 批量生成：单个提示词节点一次可生成 `1`、`2` 或 `4` 张图片，并自动连到新图片节点。
- 图片节点操作：支持全屏查看、复制图片、复制提示词、下载、重新生成，以及“以此为参考新建节点”。
- 画布辅助：支持撤销/重做、适应视口、右键菜单、新建节点、自动布局、清空画布。
- 本地项目持久化：项目索引、画布快照和图片资产默认保存到仓库本地 `data/projects/`；无本地 API 时会回退到 IndexedDB。
- API Key 处理：优先支持 AI Studio 的官方授权，也支持手动输入 Gemini API Key。

## 运行环境

- Node.js 20.18.1 或更高版本
- 可用的 Gemini API Key

## 本地启动

1. 安装依赖

```bash
npm install
```

2. 配置环境变量

本地运行时建议复制一份 `.env.example` 为 `.env`，至少配置：

```bash
GEMINI_API_KEY=你的_Gemini_API_Key
```

如果要使用 `Image2` 模型，还需要配置 OpenAI-compatible chat completions 中转：

```bash
IMAGE2_BASE_URL=你的_Image2_Base_URL
IMAGE2_API_KEY=你的_Image2_Key
IMAGE2_MODEL=你的_Image2_模型名
```

`IMAGE2_BASE_URL` 填 API base URL，例如 `https://api.akemi.cc/v1`。如果误填成 `https://api.akemi.cc/v1/chat/completions`，服务端也会自动解析回 `https://api.akemi.cc/v1`。

`gpt-image-*` 模型会自动走 `/v1/images/generations` 或 `/v1/images/edits`；其他模型默认走 `/v1/chat/completions`。如需强制指定，可设置 `IMAGE2_ENDPOINT_TYPE=images` 或 `IMAGE2_ENDPOINT_TYPE=chat`。

如果你在需要代理的网络环境下访问 Gemini 或 image2 中转，也可以额外设置：

```bash
HTTPS_PROXY=http://127.0.0.1:7890
```

或：

```bash
HTTP_PROXY=http://127.0.0.1:7890
```

3. 启动开发服务器

```bash
npm run dev
```

4. 打开浏览器访问：

```text
http://localhost:3000
```

`npm run dev` 会启动 `server.ts`，同时挂载 Express API 和 Vite 中间件，适合本地完整调试。

## 使用方式

1. 点击底部“新建创作节点”，或在画布空白处右键创建新节点。
2. 输入提示词；需要时可上传参考图，或直接在文本框里 `Ctrl+V` 粘贴图片。
3. 可先点击“优化”让 Gemini 3.1 Pro 改写提示词，再点击“开始生成”。
4. 生成结果会作为新的图片节点出现在当前节点右侧，并自动建立连线。
5. 悬停图片节点可执行复制、下载、全屏、重新生成、继续作为参考图等操作。
6. 当画布变复杂后，可以使用自动布局和适应视口快速整理结构。

## 快捷键

- `Ctrl+Enter` / `Cmd+Enter`：在当前提示词框内直接生成
- `Ctrl+Z` / `Cmd+Z`：撤销
- `Ctrl+Shift+Z` / `Cmd+Shift+Z`：重做
- `Ctrl+Y`：重做
- `N`：新建创作节点
- `F`：适应当前画布到视口
- `Delete` / `Backspace`：删除已选中的节点

## 参数与行为说明

### 创作节点

- Banana2 支持的画面比例：`1:1`、`1:4`、`1:8`、`2:3`、`3:2`、`3:4`、`4:1`、`4:3`、`4:5`、`5:4`、`8:1`、`9:16`、`16:9`、`21:9`
- Banana2 支持的分辨率：`512`、`1K`、`2K`、`4K`；旧项目中的 `512px` 会自动按官方 `512` 发送
- 支持的批量数量：`1`、`2`、`4`
- 参考图上限：4 张
- 生成模型：`Banana` 使用 `gemini-3.1-flash-image-preview`；`Image2` 使用 `.env` 中配置的 OpenAI-compatible chat completions 中转
- 提示词优化模型：`gemini-3.1-pro-preview`

### 图片节点

- 可复制图片到剪贴板
- 可复制对应提示词
- 可下载为本地 PNG
- 可基于同一提示词重新生成
- 可直接把当前图片转成下一轮创作节点的参考图

### 本地状态

- 本地开发默认把项目索引、画布快照和图片资产保存到 `data/projects/`。
- 可用 `BANANA_DATA_DIR` 改变本地项目存储目录；相对路径会从项目根目录解析。
- 前端仍使用 `zustand + zundo` 管理画布状态和最多 50 步历史记录。
- 如果 `/api/projects` 不可用，会回退到 IndexedDB，并可在本地 API 可用时迁移旧浏览器项目。
- 未被当前画布或历史引用的图片资产会自动清理，避免无限膨胀。
- `data/` 已被 `.gitignore` 忽略，避免误提交用户本地项目图片。

### Banana2 高级参数

选择 `Banana` 模型后，提示词节点的设置面板会显示 Gemini Nano Banana 2 官方高级参数：

- `responseModalities`：固定发送仅 `IMAGE`，因为本项目只消费图片 part。
- `thinkingConfig.thinkingLevel`：发送官方枚举 `MINIMAL`、`LOW`、`MEDIUM`、`HIGH`；复杂文字、构图和多约束任务可提高等级，但会增加延迟。
- `mediaResolution`：控制参考图解析强度，支持 `MEDIA_RESOLUTION_LOW`、`MEDIA_RESOLUTION_MEDIUM`、`MEDIA_RESOLUTION_HIGH`。
- `tools.googleSearch`：可开启 Google Search grounding，让模型使用实时网页/图片搜索信息；通常会增加延迟和成本。
- `safetySettings`：骚扰、仇恨、色情、危险四类默认固定发送 `OFF`，前端不提供调节。
- Banana2 没有 Image2 的 `output_format`、透明背景独立开关、压缩、`partial_images`、mask 参数；透明背景只能通过提示词尝试。
- 服务端会使用 Gemini 返回的 `inlineData.mimeType` 生成 data URL，不再强制按 PNG 处理。

### Image2 高级参数

选择 `Image2` 模型后，提示词节点的设置面板会显示中转兼容的高级参数：

- 前端只开放实际需要调的参数：`quality`、`output_format`、`output_compression`、`response_format`、`partial_images`。
- `background` 固定发送 `opaque`，`moderation` 固定发送 `low`，`stream` 固定跟随 `.env` 的 `IMAGE2_STREAM`。
- `output_compression` 只会在 `output_format` 为 `jpeg` 或 `webp` 时发送。
- `gpt-image-2` 不支持 `background=transparent`；前端不提供透明背景选择，旧节点或手写请求也会在发送前丢弃。
- `input_fidelity` 对 `gpt-image-2` 不可调，官方要求省略；模型会自动高保真处理输入图。
- `CLIProxyAPI` 当前会忽略 `n`、`style`、`user`；前端的“生成数量”会用多次请求实现多图。
- `response_format=url` 在 `CLIProxyAPI` 中返回的是 `data URL`，不是官方 60 分钟临时 URL。
- `file_id` 编辑图不支持；当前项目通过上传/粘贴参考图走 multipart `image`，mask 局部编辑会把原图和蒙版统一转为同尺寸 PNG。

## 环境变量

| 变量名 | 用途 |
| --- | --- |
| `GEMINI_API_KEY` | 本地或服务端调用 Gemini API 时使用的默认 Key |
| `IMAGE2_BASE_URL` | Image2 中转 API base URL，使用 Image2 时必须配置，例如 `https://api.akemi.cc/v1` |
| `IMAGE2_API_KEY` | Image2 中转接口 Key，使用 Image2 时必须配置 |
| `IMAGE2_MODEL` | 发送到 Image2 中转接口的模型名，使用 Image2 时必须配置 |
| `IMAGE2_ENDPOINT_TYPE` | 可选，`images` 或 `chat`；默认 `gpt-image-*` 走 images，其他模型走 chat |
| `IMAGE2_HTTPS_PROXY` | 可选，image2 专用代理；不填时复用 `HTTPS_PROXY` 或 `HTTP_PROXY` |
| `IMAGE2_PROXY_MODE` | 可选，`proxy`、`auto` 或 `direct`；默认 `direct`，避免 image2 relay 被本机代理路径拖慢或 504 |
| `IMAGE2_MAX_ATTEMPTS` | 可选，image2 最大尝试次数，默认 `1`；调大可能产生重复生图成本 |
| `IMAGE2_HEDGE_ENABLED` | 可选，`true` 时在 `IMAGE2_MAX_ATTEMPTS > 1` 下启用 proxy/direct 并发竞速；默认关闭，避免额外 token 消耗 |
| `IMAGE2_STREAM` | 可选，`true` 时 images 接口请求 SSE 流式结果；适合中转有约 60s 空闲网关超时的情况 |
| `IMAGE2_PARTIAL_IMAGES` | 可选，流式 images 请求的局部图数量，范围 `0`-`3`；大于 `0` 更容易保持连接活跃，但可能增加 image token 成本 |
| `IMAGE2_REQUEST_TIMEOUT_MS` | 可选，image2 单次请求超时，默认 `240000` |
| `IMAGE2_RETRY_DELAY_MS` | 可选，image2 两次尝试之间的等待时间，默认 `1000` |
| `IMAGE2_PROXY_CONNECT_TIMEOUT_MS` | 可选，image2 代理建连超时，默认 `60000` |
| `BANANA_DATA_DIR` | 可选，本地项目文件存储目录，默认 `./data` |
| `HTTPS_PROXY` | 可选，为服务端请求配置 HTTPS 代理；banana 和 image2 都会复用 |
| `HTTP_PROXY` | 可选，为服务端请求配置 HTTP 代理；banana 和 image2 都会复用 |
| `APP_URL` | `.env.example` 中保留的 AI Studio 模板变量，当前主要流程未直接使用 |

## 可用脚本

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 启动 Express + Vite 开发环境，包含图像生成和提示词优化接口 |
| `npm run build` | 构建前端静态资源到 `dist/` |
| `npm run lint` | 运行 TypeScript 类型检查 |
| `npm run preview` | 仅预览 Vite 构建产物，不包含 Express API |
| `npm run clean` | 删除 `dist/` 目录 |

## 主要目录

```text
.
├─ src/
│  ├─ components/
│  │  ├─ Canvas.tsx                # 画布、右键菜单、快捷键、自动布局
│  │  ├─ ApiKeyCheck.tsx           # API Key 检测与手动录入
│  │  ├─ nodes/
│  │  │  ├─ PromptNode.tsx         # 提示词节点
│  │  │  ├─ ImageNode.tsx          # 图片节点
│  │  │  ├─ Image2OptionsPanel.tsx # Image2 高级参数面板
│  │  │  ├─ BananaOptionsPanel.tsx # Banana2 高级参数面板
│  │  │  ├─ GeneratingImagePlaceholder.tsx # 生成中过渡卡片
│  │  │  └─ PromptTextarea.tsx     # 文本框与 Ctrl/Cmd+Enter 提交
│  │  ├─ mask/                     # Image2 蒙版编辑与对比弹窗
│  │  ├─ projects/                 # 项目列表、缺失项目状态
│  │  └─ edges/
│  │     └─ DeletableEdge.tsx      # 可悬停删除的边
│  ├─ pages/                       # 项目列表页与项目画布页
│  ├─ services/gemini.ts           # 前端调用后端接口
│  ├─ store.ts                     # 画布状态和历史记录
│  └─ lib/                         # 模型参数、项目存储、资产归档、路由等
├─ server.ts                       # Express API 与 Vite 中间件入口
├─ metadata.json                   # AI Studio 元数据
└─ .env.example                    # 示例环境变量
```

## 测试

当前仓库包含项目路由、本地文件存储、IndexedDB 回退、画布资产归档、模型参数、节点组件、mask 编辑和前端 payload 测试。推荐执行全量测试：

```bash
npx tsx --test "src/**/*.test.ts" "src/**/*.test.tsx"
```

## 当前架构概览

- 前端：React 19 + Vite + Tailwind CSS 4 + React Flow
- 状态：Zustand + Zundo
- 持久化：本地 Express 文件存储；无本地 API 时回退 IndexedDB
- 后端：Express
- AI SDK：`@google/genai`

前端通过 `/api/projects` 读写本地项目，通过 `/api/generate-image` 和 `/api/optimize-prompt` 调用后端，再由后端统一请求 Gemini 或 Image2 中转。这样本地开发和 AI Studio 部署可以共用一套交互逻辑。
