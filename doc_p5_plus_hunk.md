#### P5+ 增强：入库自动兜底 + 主动 backfill

P5 处理的是「新图下载 + 优先用 localPath」，但遗留一个问题：**P5 之前入的库没有 localPath**。如果用户历史项目里几千张图都靠外链 URL，24h 后会全失效。P5+ 解决这个：

- **任何 `create_asset` 入库即后台兜底**：Rust 端 `create_asset` 改 async，DB 写完立刻 `spawn_local_path_backfill` 串行下缺图的 localPath，写完异步回 `payload.localPaths`。用户响应不等下载（先用 url 看图）
- **主动 backfill**：`commands::backfill_local_assets(project_id?)` 扫「urls 有但 localPaths 缺」的资产，每条 `tokio::spawn` 并发下。返回 `BackfillReport { scanned, downloaded, failed, brokenMarked }`
- **失败标 broken**：下载失败的资产标 `payload.broken = true`。前端目前不消费这个字段，**未来 UI 可以**给「图已过期」角标 + 提示重生成
- **路径安全**：写回时 `canonicalize` 后必须在 `app_data_dir/assets/` 下（防越权，校验失败则该项记空字符串不入 payload）

前端：
- `src/lib/assets.ts::backfillLocalAssets(projectId?)` 暴露给前端（走 Tauri IPC）
- `ProjectDetail` 切项目时 `useEffect([currentProject?.id])` 自动跑一次。下载成功/部分失败时 `reload({ silent: true })` 让 SafeImage 切到本地
- 静默失败不打扰用户（最坏情况就是 24h 后图片过期，与改之前一样）

两个 helper：
- `extract_urls_for_backfill(payload)`：支持两种 payload —— 普通 `payload.urls[]`、图层拆分 `payload.layers[]`（按 zIndex 升序）
- `extract_local_paths_for_backfill(payload)`：平行数组（urls 模式写 `localPaths`，图层模式写 `layerLocalPaths`），缺位填 None 让 backfill 知道要补哪里

**与 P5 的关系**：
- P5 = jimeng_generate 路径下载（同步生图 / 流式 partial）
- P5+ = create_asset 路径兜底（任何入库都触发）+ 主动扫缺图
- 两条链路互补：P5 处理新图，P5+ 修复老图

### 1.12 Skill 模板 + Agent 工具扩展（P6）
