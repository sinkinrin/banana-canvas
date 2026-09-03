<div align="center">
  <img src="docs/images/canvas-workflow.png" alt="香蕉画图工作流" width="1200" />

  <h1>香蕉画图</h1>
  <p>本地优先、支持迭代创作的无限画布 AI 生图工具。</p>
</div>

> [!TIP]
> 🌐 **English: [Read the default README](README.md)**

当前版本：`0.6.0`

版本变更见 [CHANGELOG.md](CHANGELOG.md)，维护者发布流程见 [docs/RELEASING.md](docs/RELEASING.md)。

香蕉画图把生图过程变成一张可视化工作流：在无限画布上组织提示词节点和图片节点，把结果继续作为下一轮参考，保留分支、中间方案和完整迭代关系。

## 核心能力

- **可视化生图工作流**：基于 React Flow 自由摆放、连接和整理提示词与图片节点。
- **多模型支持**：新节点默认使用 Image2，也可切换 Banana 2、Banana 2 Lite 和 Banana Pro。
- **参考图迭代**：上传或粘贴最多 4 张参考图，并可从任意结果继续创作。
- **构图草图**：生成前先画人物位置、动作、箭头和画面关系，草图会作为参考图发送。
- **蒙版局部编辑**：涂抹需要修改的区域，使用 Image2 生成并对比原图与新图。
- **跨项目提示词库**：保存、搜索、标记并复用常用提示词。
- **本地优先项目**：画布、节点关系与图片资产都保存在自己的设备上。
- **中英文界面**：首次启动跟随系统语言，手动切换后会记住选择。

## 界面预览

<table>
  <tr>
    <td width="50%"><img src="docs/images/project-list.png" alt="本地项目列表" /></td>
    <td width="50%"><img src="docs/images/prompt-settings.png" alt="提示词节点与模型设置" /></td>
  </tr>
  <tr>
    <td align="center"><sub>本地项目</sub></td>
    <td align="center"><sub>提示词与模型参数</sub></td>
  </tr>
</table>

<details>
  <summary><strong>查看 Image2 蒙版编辑器</strong></summary>
  <br />
  <img src="docs/images/mask-editor.png" alt="Image2 蒙版编辑器" width="900" />
</details>

## 快速开始

运行要求：

- Node.js 22.17.1 或更高版本
- 可用的 Image2/OpenAI-compatible 中转；Banana 系列和提示词优化才需要 Gemini API Key

```bash
npm install
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000)，进入“**应用设置**”，填写 Image2 Base URL、API Key 和模型名；保存后立即生效。

从源码启动 Electron 桌面版：

```bash
npm run electron
```

只浏览项目、整理画布和查看已保存图片时，不需要 API Key。

## 基本工作流

1. 新建项目，在“应用设置”里配置模型连接。
2. 从底部工具栏或画布右键菜单添加创作节点。
3. 输入提示词；需要时上传、粘贴参考图，或绘制构图草图。
4. 选择模型、画幅、分辨率、生成数量和模型专属参数。
5. 生成图片后，可从结果继续分支，也可用蒙版做局部修改。
6. 画布变复杂后，使用自动布局、适应视口、撤销/重做和提示词库整理工作流。

## 界面语言

当前支持：

- English (`en`)
- 简体中文 (`zh-CN`)

首次启动会跟随操作系统语言。之后可在“**应用设置**”顶部随时切换，选择会保存在本机。翻译资源位于 [`src/i18n/locales`](src/i18n/locales)。

## 连接配置

推荐直接使用“应用设置”。桌面版会通过 Electron `safeStorage` 保存 API Key。开发环境也可以把 `.env.example` 复制为 `.env`：

```bash
IMAGE2_BASE_URL=https://example.com/v1
IMAGE2_API_KEY=your_key
IMAGE2_MODEL=gpt-image-2
GEMINI_API_KEY=optional_gemini_key
GEMINI_PROMPT_OPTIMIZER_MODEL=gemini-3.8-flash
```

模型行为、代理、输入限制、存储方式和完整环境变量表见 [Configuration](docs/CONFIGURATION.md)。

## 本地数据与安全

- npm 开发模式把项目保存在 `data/projects/`，提示词库保存在 `data/prompt-library.json`。
- Electron 把项目与设置保存在当前用户的应用数据目录，不写入安装目录。
- 桌面版在系统支持时用操作系统凭据存储加密 Key，且不会把已保存 Key 返回渲染进程。
- 服务默认只监听 `127.0.0.1`；本地 API 没有公网部署所需的认证层，请勿直接暴露到公网。
- 自动更新默认关闭；开启后会在后台下载更新，但重启安装前仍会询问用户。
- Windows 安装包目前未签名，安装或更新时可能出现 SmartScreen“未知发布者”提示。

## 文档导航

| 文档 | 内容 |
| --- | --- |
| [Configuration](docs/CONFIGURATION.md) | 模型、应用设置、代理、限制与环境变量 |
| [Development](docs/DEVELOPMENT.md) | 脚本、架构、数据目录与验证方式 |
| [路线图](docs/ROADMAP.md) | 画布与项目能力的后续规划 |
| [Changelog](CHANGELOG.md) | 各版本用户可见变更 |
| [发布流程](docs/RELEASING.md) | 维护者发布检查清单 |

## 验证

```bash
npm test
npm run check
```

`npm install` 是首次安装依赖的步骤；`npm run check` 只验证当前依赖和代码，不会替你执行 `npm install`。

完整脚本列表和桌面端 smoke 测试见 [Development](docs/DEVELOPMENT.md)。
