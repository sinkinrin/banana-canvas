# Multi-Project Pages Design

## Goal

为“香蕉画图”增加本地多项目能力：用户可以在项目列表页创建、进入、重命名、删除项目，并通过独立 URL 页面打开单个项目画布。数据仅保存在当前浏览器本地，不要求跨浏览器或跨设备同步。

## Constraints

- 保持现有 Gemini 图像生成与提示词优化接口不变。
- 第一版不引入服务端项目 API，也不引入 SQLite。
- 第一版不做云同步、导入导出、回收站、项目分组或搜索。
- 需要兼容已有单画布用户的数据，避免升级后出现空白项目列表。

## Chosen Approach

采用 `IndexedDB + 本地项目索引 + 项目详情页路由`。

- `/`：项目列表页
- `/projects/:projectId`：项目画布页

项目元数据与画布快照分开存储：

- `banana-projects-index`：项目索引，保存 `id`、`name`、`createdAt`、`updatedAt`
- `banana-project:{projectId}`：单个项目的 `nodes`、`edges`、`assets`

现有 Express 接口继续只负责模型调用，不感知项目概念。

## Why Not SQLite

SQLite 只在服务端项目化架构下才有明显收益。当前应用的真实交互中心在浏览器端，现有持久化也已经基于 `IndexedDB`。如果为了本地多项目引入 SQLite，就必须补充项目 CRUD API、服务端数据模型和前后端同步逻辑，复杂度显著上升，但当前需求并不需要这些能力。

## Route Model

第一版不引入重量级路由系统，使用最小可行的客户端路径解析即可满足需求：

- 根路径 `/` 渲染项目列表
- `/projects/:projectId` 渲染项目画布
- 其他路径回退到列表页或显示缺失状态

服务端生产回退已支持 SPA，因此不需要修改 API 路由结构。

## Data Model

### Project Metadata

```ts
type ProjectMeta = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};
```

### Project Snapshot

```ts
type ProjectSnapshot = {
  nodes: AppNode[];
  edges: Edge[];
  assets: Record<string, CanvasImageAsset>;
};
```

## Store Strategy

保留“当前页面只操作一个画布 store”的交互模型，不做多 store 并存。

实现方式：

- 进入项目页时，从 `banana-project:{projectId}` 读取快照
- 将快照灌入当前画布 store
- 继续复用现有 `Canvas`、`PromptNode`、`ImageNode` 交互
- 当节点、边或资产变化时，自动把当前 store 快照写回对应项目

这比“每个项目一个 Zustand store 实例”更简单，也更贴合当前单页结构。

## Legacy Migration

当前版本只存在一份全局画布数据。升级后：

- 如果发现 `banana-projects-index` 不存在，但旧画布数据存在
- 自动创建一个默认项目，例如“未命名项目”
- 将旧画布的 `nodes`、`edges`、`assets` 迁移到该项目
- 写入项目索引

迁移完成后，新结构成为唯一真相源。旧键可在确认迁移成功后保留一段时间或延后清理，避免一次性数据丢失风险。

## UI Design

### Projects Page

- 展示本地项目卡片，按 `updatedAt` 倒序
- 提供“新建项目”
- 每个项目支持进入、重命名、删除
- 空状态下提供“创建第一个项目”

### Project Canvas Page

- 保留现有画布 UI
- 顶部增加轻量项目栏
- 项目栏包含：
  - 返回项目列表
  - 当前项目名，可直接重命名
  - 自动保存提示
- 若项目不存在，显示缺失状态页

## Error Handling

- `projectId` 不存在：显示“项目不存在”，并提供返回入口
- 项目读取失败：显示错误态，不覆盖现有其他项目
- 删除项目：同时删除元数据和项目快照
- 重命名项目：仅更新项目索引
- 自动保存失败：显示非阻塞错误提示，不中断当前编辑

## Testing Strategy

第一版重点覆盖以下行为：

- 路径解析与项目路径生成
- 项目索引增删改查
- 项目快照读写
- 旧单画布数据迁移
- 项目列表排序
- 当前项目不存在时的页面状态

UI 层尽量拆成可静态渲染的纯组件，以便继续沿用当前仓库的轻量测试方式。

## Out Of Scope

- 云同步
- SQLite
- 服务端项目 API
- 项目分享链接
- 项目搜索/标签/分组
- 跨项目复制节点
- 项目级导入导出
