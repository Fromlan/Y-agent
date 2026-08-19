# Y-agent

> 游戏美术 AI 工作台 · 调用即梦（豆包 Seedream）API

把通用图像生成能力封装为**游戏美术师开箱即用的工作流**。参考 MiniMax Design 的三栏布局，专注游戏美术场景。

## 当前状态

**M0 原型验证 ✅ 已完成**（2026-08-19）
**M1 MVP ✅ 已完成**（2026-08-19）
**M2 Agent 对话模式 v0.4 ✅ 已完成**（2026-08-19）

- ✅ Tauri 2 桌面应用（Windows）
- ✅ 即梦 API 真实联调通过（5.0 Lite / 4.5 / 4.0 / 5.0 Pro 图层拆分）
- ✅ 0 warning 0 error
- ✅ **M2**：6 预置 Skill + 规则路由（plan 确认模式）+ LLM 真对话（DeepSeek / 豆包 / OpenAI / 自定义）
- ✅ **M2**：项目级 Agent Memory（自动学习画风偏好）
- ✅ **M2**：对话历史持久化（SQLite）+ Markdown 渲染 + 清空历史
- ⏳ M3 角色工坊 待启动

详细进度看 [`doc/plan.md`](./doc/plan.md)。开发细节看 [`doc/dev.md`](./doc/dev.md)。

## 截图占位

> 启动应用后即可看到三栏布局：左侧导航 / 中央创作区 / 右侧详情。
> 项目内页有「对话 / 资产」两个 tab，可随时切换。

## 快速试用

```bash
# 1. 安装依赖
pnpm install

# 2. 启动开发模式（应用 + 热重载）
.\dev-with-msvc.cmd
# 或 PowerShell 直接调:
# & "E:\Pi\Y-agent\dev-with-msvc.cmd"
```

应用启动后：
1. 打开「设置」面板（左下角齿轮）
2. 选「试用 Demo 模式」—— 不用 Key 也能看 UI
3. 或者填入 [火山方舟 API Key](https://console.volcengine.com/ark/region:cn-beijing/apiKey)
4. （可选）填「Agent LLM」配置 —— 想用真对话模式必填
5. 在「开始创作」输入 prompt → 选模型（默认 5.0 Lite）→ 生成
6. 想用对话模式：在输入框点 **/ 选 Skill**，或直接说需求（LLM 会主动反问 / 调工具）

## 模式说明

| 模式 | 行为 | 何时用 |
|---|---|---|
| **生图** | 直接调即梦 API，资产入库 | 知道想要什么、要快 |
| **对话（无 LLM Key）** | 规则路由 → 展示计划 → 点确认才生图 | 没 LLM Key 也能体验 |
| **对话（有 LLM Key）** | LLM 主动反问 / 调工具 / 反复迭代 | 想要 AI 陪你磨 prompt、画风调优 |

模式间可随时切换，**资产网格永远在另一个 tab 等你**。

## 模型支持

| 模型 | Model ID | 图层拆分 | 组图 | 备注 |
|---|---|---|---|---|
| Seedream 5.0 Lite | `doubao-seedream-5-0-lite-260128` | ❌ | ✅ | **默认**，多数账号已开通 |
| Seedream 4.5 | `doubao-seedream-4-5-251128` | ❌ | ✅ | |
| Seedream 4.0 | `doubao-seedream-4-0-250828` | ❌ | ✅ | |
| Seedream 5.0 Pro | `doubao-seedream-5-0-pro-260628` | ✅ | ❌ | **需手动开通**，M2 重点 |
| 自定义 | (Endpoint ID) | — | — | 选「自定义 ID…」填入 |

**首次接入真实 API 必读** [`doc/api-integration-notes.md`](./doc/api-integration-notes.md)—— 5 个常见坑的解决方案。

## LLM 支持（Agent 对话模式）

设置面板 → 「Agent LLM（用于对话）」区块：

| Provider | 默认模型 | Endpoint |
|---|---|---|
| **DeepSeek**（推荐） | `deepseek-v4-flash` | `https://api.deepseek.com/v1/chat/completions` |
| **豆包 Lite**（火山方舟） | `doubao-lite-32k` | `https://ark.cn-beijing.volces.com/api/v3/chat/completions` |
| **OpenAI** | `gpt-4o-mini` | `https://api.openai.com/v1/chat/completions` |
| **自定义** | 任意 OpenAI 兼容端点 | 自己填 |

**降级**：不填 LLM Key → 对话模式自动回落到「规则路由 + 计划确认」（不自动生图）。

## 文档

- [`doc/plan.md`](./doc/plan.md) — 14-18 周完整路线图 + 当前进度
- [`doc/dev.md`](./doc/dev.md) — 开发指南（命令、目录、架构、调试）
- [`doc/api-integration-notes.md`](./doc/api-integration-notes.md) — API 集成踩坑笔记
- [`doc/即梦api.md`](./doc/即梦api.md) — 即梦 API 原始文档
- [`doc/即梦提示词参考.md`](./doc/即梦提示词参考.md) — 提示词最佳实践

## 技术栈

- **桌面壳**：Tauri 2
- **前端**：React 18 + TypeScript + Vite 5 + Tailwind 3
- **后端**：Rust（reqwest + rusqlite + aes-gcm）
- **存储**：SQLite（bundled）+ 文件系统
- **图像 API**：火山方舟即梦（Seedream 4.0/4.5/5.0 lite/pro）
- **LLM API**：DeepSeek / 豆包 / OpenAI / 自定义 OpenAI 兼容端点
- **前端 Markdown**：`react-markdown` + `remark-gfm`

## 目录结构

```
E:\Pi\Y-agent\
├── doc/                # 文档
├── src/                # 前端 (React + TS)
│   ├── components/     # UI 组件
│   ├── lib/            # API 客户端、Agent 引擎、工具
│   └── skills/builtin/ # 【M2】6 个预置 Skill 模板
├── src-tauri/          # Rust 后端
├── public/             # 静态资源
├── build-with-msvc.cmd # 单独跑 cargo
├── dev-with-msvc.cmd   # 跑 npm run tauri:dev
├── package.json
└── vite.config.ts
```

## 路线图

```
M0 ✅ → M1 ✅ → M2 v0.1 ✅ → M2 v0.2 ✅ → M2 v0.3 ✅ → M2 v0.4 ✅
                                          ↓
                                     M3 角色工坊 → M4 场景+UI → M5 图层 → M6 Skill 中心 → M7 打磨发布
```

每个里程碑详细任务见 `doc/plan.md`。
