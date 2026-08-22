# 视频生成可视化方案

> 目标：让视频生成过程对用户**可见、可追踪、可恢复**。参考 MiniMax 开放平台两个文档：
> - [查询任务（单任务）](https://platform.minimaxi.com/docs/api-reference/video-generation-v2-query)
> - [查询任务列表（最近 7 天，分页）](https://platform.minimaxi.com/docs/api-reference/video-generation-v2-list)
>
> 状态：设计稿。若通过再进入实现。

---

## 1. 现状问题

视频提交是异步长任务（i2va 2K 5s 通常 1–3 分钟，最长轮询 10 分钟），但当前的反馈只有一个**瞬时 toast**：

```
toast.info(`视频生成中… ${sec}s（${status}）`)
```

缺陷：

- **无持续状态**：toast 几秒消失，用户切 tab / 切项目 / 刷新后就看不到进度。
- **任务会「丢」**：`task_id` 只存在内存（`AppState.video_tasks` + React `videoTaskId`），
  应用重启后进行中的任务彻底失联，视频「消失了」。
- **无失败沉淀**：失败原因只在 toast 一闪而过，不可回看、不可重试。
- **无历史**：看不到最近生成任务的成败记录。
- **进度无感知**：API 只有粗粒度状态，若画一根「假百分比」进度条会误导用户。

## 2. 数据基础（两个文档给的信息）

每个任务（query / list 都返回）携带：

| 字段 | 含义 | 用途 |
|---|---|---|
| `status` | `queued` / `running` / `succeeded` / `failed` / `cancelled`（可能有中间态，未知态按 running 兜底） | 状态机驱动 |
| `created_at` | Unix 秒时间戳（例 `1785225940`） | 算耗时、排序、判断是否卡住、跨重启找回 |
| `content.url` | 成功后的视频地址 | 播放源 |
| `error.message` | 失败原因（例 `video description contains sensitive content`） | 失败展示 / 重试 |
| `resolution` / `duration` / `ratio` | 元信息 | 卡片 chips |

**List 端到端**（关键能力）：
`GET https://api.minimaxi.com/v2/query/video_generation?page_num=1&page_size=4`
- 分页查询**最近 7 天**任务列表，支持按 `status` / `task_id` / `model` / `task_type` 过滤。
- 返回数组，每项含 `status` + `created_at` + `content` + 失败 `message`。
- → 用于：跨重启找回进行中任务、任务中心历史。

> 注：list 接口的确切包裹字段（`tasks` 数组键名 / `page_info` / 鉴权方式）以联调实测为准；
> 文档示例显示它与单任务 query 共用 `query/video_generation` 路径，只是加 `page_num`/`page_size` 参数。

## 3. 设计

### 3.1 把「生成任务」变成可见对象（VideoTaskCard）

不再依赖 toast，而是渲染一个**持续存在的任务卡片**。提交瞬间即出现占位卡，
随状态机更新，成功后过渡成正常视频资产。

```
已提交 → 排队中(queued) → 生成中(running) → 成功(succeeded) → 视频资产
                            └──→ 失败(failed) → 显示原因 + 重试
                            └──→ 已取消(cancelled) → 灰态
```

- 只有 `succeeded` 才落库为视频资产；其余状态保留为「任务卡片」。
- 卡片内容：prompt 摘要、`MiniMax-H3` 徽章、`resolution`/`duration`/`ratio` chips、
  参考素材数、状态徽章、已耗时、操作按钮（取消 / 重试 / 查看播放）。

### 3.2 进度表达（不伪造百分比）

- **不画假百分比**。用「阶段 + 已耗时」+ **非确定进度条**（indeterminate shimmer）。
- `queued`：黄点 +「排队中」；`running`：动画 +「生成中 · 已耗时 m:ss」。
- 展示「预计约 1–3 分钟」作为**提示**（非保证），措辞用「通常/一般」。
- 状态字典（后端给前端用）：

```ts
type VideoTaskStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled" | "unknown";
const VIDEO_STATUS_LABEL: Record<VideoTaskStatus, string> = {
  queued: "排队中", running: "生成中", succeeded: "已完成",
  failed: "失败", cancelled: "已取消", unknown: "生成中",
};
```

### 3.3 任务中心（历史）

- 资产库加一个「视频任务」分组/入口，用 list 接口拉**最近 7 天**任务。
- 每项按 `created_at` 倒序：状态徽章、prompt 摘要、chips、已耗时、结果 / 失败原因、操作。
- 在「资产」tab 与「视频任务」之间可切换；进行中任务置顶。

### 3.4 跨重启续传 + 找回（list 的核心价值）

这是这次最重要的一层，解决「关掉应用视频就没了」：

1. **提交时持久化任务**：`task_id` + `meta`（optimizedPrompt/originalPrompt/reason）+
   `project_id` + `created_at` 写入 SQLite（新增 `video_tasks` 表）。
2. **每次进项目 / 应用启动时**，用 list 接口 `filter status=queued,running` 找回未落定任务：
   - 服务端仍 running/queued → **重新挂上轮询**（re-attach `poll_video_task`），UI 恢复「生成中」。
   - 服务端 succeeded、但本地未入库 → 下载视频 + 入库 asset + 显示。
   - failed / cancelled → 直接显示终态。
3. 本地已入库（succeeded）的任务从 `video_tasks` 里移除，避免重复找回。

### 3.5 入口与交互

- `VideoPromptBar` 提交按钮下渲染「当前进行中任务卡」（v1 单任务，可扩展为队列）。
- 卡片支持：取消（已有 `cancelVideo`）、失败一键重试（复用 `onSubmitVideo` 参数）、成功后「查看/播放」。
- toast 降级为「状态变更提醒」（排队中/成功/失败各提醒一次），不作为唯一反馈。

## 4. 技术落点（对应代码）

### 后端 Rust

| 文件 | 改动 |
|---|---|
| `src-tauri/src/video.rs` | `VideoTask` 增加 `created_at: Option<i64>`（unix 秒）、`task_type`，补全状态枚举；新增 `list_tasks(api_key, filter, page) -> Vec<VideoTask>` |
| `src-tauri/src/commands.rs` | 新增 `jimeng_video_list` 命令；`poll_video_task` 成功/失败时写终态到 `video_tasks`；submit 时落库；新增启动恢复逻辑（仿 `startup_backfill_assets`） |
| `src-tauri/src/storage.rs` | 新增 `video_tasks` 表：`task_id`(PK)、`project_id`、`prompt`、`meta`(JSON)、`status`、`created_at`、`updated_at` |
| `src-tauri/src/state.rs` | `VideoTaskHandle` 增加 `created_at`/`project_id`；`video_tasks` 由持久化表驱动 |

### 前端 TS/React

| 文件 | 改动 |
|---|---|
| `src/lib/video.ts` | 新增 `listVideoTasks()`；`VideoTask`/`VideoEvent` 类型加 `createdAt`、`taskType`、`errorMessage` |
| `src/components/workspace/VideoTaskCard.tsx`（新） | 状态机渲染 + 取消/重试/播放 |
| `src/components/workspace/ProjectDetail.tsx` | 用 `useVideoTasks` 钩子管理进行中 + 最近任务列表，替代当前单一 `videoTaskId` |
| `src/components/workspace/VideoPromptBar.tsx` | 提交后渲染任务卡；「任务中心」入口 |
| `src/components/workspace/AssetBoard.tsx` / 资产分组 | 视频任务分组 / 过滤 |

## 5. 边界与确认点

- **未知 status**：按 `running` 展示并打日志（后端先识别，硬失败按 failed 处理）。
- **list 接口字段**：`tasks` 数组键名、`page_info`、鉴权 —— 以联调实测为准。
- **单项目单任务限制（v1）**：改造时可保留为「同项目仅一个进行中任务」，长线再放开队列。
- **demo 模式**（`demo-*` key）：也要有占位任务卡，走虚拟 succeeded。
- **耗时基准**：`created_at` 为 Unix 秒，前端用 `now - created_at` 计算 m:ss；避免用单调时钟.
- **历史仅 7 天**：任务中心只展示最近 7 天，更早的归档/忽略。

## 6. 验收标准（手动冒烟）

1. 提交视频后**立即**出现「排队中」卡片，状态随轮询实时更新。
2. 成功后卡片变为**可播放视频**并入库资产库（不再是空白视频）。
3. 失败时卡片显示 `code + message`，可**一键重试**。
4. **关闭应用重新打开**后，进行中的任务自动找回并恢复「生成中」；成功但未入库的自动补齐。
5. 任务中心能看到最近 7 天任务、状态、时长、resolution、失败原因。

## 7. 里程碑拆分（建议）

- **M1 可见性**：`VideoTaskCard` + 状态机 + 事件扩展（不改存储，仍内存态）。→ 解决「看不到进度」。
- **M2 持久化 + 找回**：`video_tasks` 表 + list 接口 + 启动恢复。→ 解决「重启丢任务」。
- **M3 历史中心**：任务列表 UI + 过滤 + 重试。→ 解决「无历史 / 不能重试」。

每个里程碑之后跑 `.\build-with-msvc.cmd` + `pnpm lint` + `pnpm test` + `pnpm build`。
