/**
 * Agent 可用工具的定义（OpenAI function calling 格式）
 * v0.1：只暴露 jimeng.generate_image 一个工具
 * v0.2：加 jimeng.decompose_layers、web.search 等
 * v0.3（P6）：扩展 jimeng_generate_image schema + 新增 jimeng_local_edit / jimeng_decompose_layers
 */

import type { ToolDefinition } from "@/lib/llm";

export const AGENT_TOOLS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "jimeng_generate_image",
      description:
        "调用即梦（豆包 Seedream）API 生成游戏美术图片。P7 起：模型选择由用户在 PromptBar 选定的模型决定，工具调用里**通常不要传 model 字段**。只有当用户消息里**明确要求**切换模型（「用 4.5 重新画」/「换成 Pro 做图层拆分」）时才传。能力位参数：图生图（ref_required=true 时必传 image）、单图/组图（max_images 1-15，具体上限以模型能力为准；仅 Lite/4.x 支持组图）、透明背景（background=transparent，仅 5.0 Pro + PNG）、极速 prompt 优化（fast_mode，仅 5.0 Pro / 4.0）、web_search 工具调用（仅 5.0 Lite）。",
      parameters: {
        type: "object",
        properties: {
          prompt: {
            type: "string",
            description:
              "中文/英文 prompt 描述。尽量具体：包含主体、画风、构图、配色、光照、镜头角度等。",
          },
          model: {
            type: "string",
            description:
              "P7 受控字段：通常**不要传**。只有在用户消息明确要求「用 X 模型」时才传。可选：doubao-seedream-5-0-lite-260128（多数账号默认开通）、doubao-seedream-4-5-251128、doubao-seedream-4-0-250828、doubao-seedream-5-0-pro-260628（需手动开通，支持图层拆分、交互编辑、透明背景）。",
            enum: [
              "doubao-seedream-5-0-lite-260128",
              "doubao-seedream-4-5-251128",
              "doubao-seedream-4-0-250828",
              "doubao-seedream-5-0-pro-260628",
            ],
          },
          size: {
            type: "string",
            description: "图片尺寸。默认 2k。",
            enum: ["1k", "1.5k", "2k", "3k", "4k"],
          },
          ref_required: {
            type: "boolean",
            description:
              "用户消息是否附带了参考图（图片附件）。如有 image 字段需一起传。",
          },
          image: {
            type: "array",
            items: { type: "string" },
            description:
              "参考图的 URL / data URL 列表。必传时（ref_required=true）不能为空。5.0 Lite 最多 4 张。",
          },
          max_images: {
            type: "number",
            description:
              "生成几张图。1-15（按模型能力上限；Lite/4.x 支持组图，5.0 Pro 不支持）。",
            minimum: 1,
            maximum: 15,
          },
          output_format: {
            type: "string",
            description:
              "输出文件格式。jpeg 通用，png 用于透明背景或需要 alpha 通道场景。4.5/4.0 仅 jpeg。",
            enum: ["png", "jpeg"],
          },
          background: {
            type: "string",
            description:
              "背景模式。transparent=输出 PNG 透明背景（仅 5.0 Pro + PNG）。用于 UI 图标 / 抠图场景。",
            enum: ["transparent", "opaque"],
          },
          fast_mode: {
            type: "boolean",
            description:
              "极速 prompt 优化。仅 5.0 Pro / 4.0 支持。开启后 API 内部把 prompt 改写到极致简洁，生成更快但更不可控。",
          },
          web_search: {
            type: "boolean",
            description:
              "启用 web_search 工具（仅 5.0 Lite）。模型可主动搜索网络来增强 prompt 准确性（如画真实地点 / 品牌）。",
          },
        },
        required: ["prompt"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "jimeng_decompose_layers",
      description:
        "把一张图拆分为 1 张底图 + 多个独立图层（5.0 Pro 专属，layer_decomposition API）。结果会按图层结构入库，每层可独立显示 / 下载 / 二次编辑。适合：把角色图 / 设计稿 / 海报拆成可拖拽的图层。",
      parameters: {
        type: "object",
        properties: {
          image: {
            type: "string",
            description: "要拆分的源图 URL / data URL（必传）",
          },
          prompt: {
            type: "string",
            description:
              "告诉模型想拆什么（如\"只拆人物和前景文字\"）。可选，缺省自动拆。",
          },
          model: {
            type: "string",
            description:
              "固定 doubao-seedream-5-0-pro-260628（仅 5.0 Pro 支持图层拆分）",
            enum: ["doubao-seedream-5-0-pro-260628"],
            default: "doubao-seedream-5-0-pro-260628",
          },
        },
        required: ["image"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "jimeng_local_edit",
      description:
        "在已有图上做局部编辑（5.0 Pro 专属，bbox 标注）。两种调用方式：(1) 给 bbox 坐标（图像素），prompt 描述改什么；(2) 自由 prompt 不指定 bbox（模型自动判断改哪里）。结果会作为新资产入库，保留原图。",
      parameters: {
        type: "object",
        properties: {
          image: {
            type: "string",
            description: "源图 URL / data URL（必传）",
          },
          edit_prompt: {
            type: "string",
            description: "修改指令（中文）。例：\"把头发改成红色\"、\"在框内加一束花\"。",
          },
          bbox: {
            type: "object",
            description: "可选：局部编辑的 bbox 范围（图像素坐标）",
            properties: {
              x1: { type: "number" },
              y1: { type: "number" },
              x2: { type: "number" },
              y2: { type: "number" },
            },
          },
          model: {
            type: "string",
            description: "固定 doubao-seedream-5-0-pro-260628",
            enum: ["doubao-seedream-5-0-pro-260628"],
            default: "doubao-seedream-5-0-pro-260628",
          },
        },
        required: ["image", "edit_prompt"],
      },
    },
  },
];

/**
 * 渲染 system prompt
 * - 注入游戏美术师角色 + 可用 Skill 列表 + 项目级风格偏好
 * - 让 LLM 主动反问而不是瞎猜
 * - P7：把"用户在 PromptBar 选定的模型"作为强偏好，避免 LLM 私自切换
 */
export function renderSystemPrompt(opts: {
  styleHints?: string[];
  recentModels?: string[];
  userModelName?: string;
}): string {
  const styleLine = opts.styleHints && opts.styleHints.length > 0
    ? `\n\n项目画风偏好（自动学到，用户没明确改的话可以参考）：${opts.styleHints.join("、")}`
    : "";
  const modelsLine = opts.recentModels && opts.recentModels.length > 0
    ? `\n\n用户最近用过的模型：${opts.recentModels.join(", ")}`
    : "";
  // P7：注入用户 PromptBar 选定的模型作为强偏好。LLM 默认必须用这个，
  // 除非用户消息里明确要求切换。如果没传 userModelName（防御性）就降级为旧版"默认 5.0 Lite"。
  const userModelLine = opts.userModelName
    ? `\n\n## P7 模型选择硬规则\n\n用户在 PromptBar 选定的模型是「${opts.userModelName}」，是本次会话的默认生图模型。\n\n- **调 jimeng_generate_image 时不要传 model 字段**，由前端用 PromptBar 选定的模型执行。\n- **只有用户消息里明确写"换成 X 模型"/"用 Pro 重新画"**时，才传 model 字段。\n- 不要主动判断升级到 5.0 Pro——用户没要求就别换。`
    : "";

  return `你是 Y-agent，一个游戏美术师 AI 助手，正在帮独立游戏美术师完成一张美术资产。

## 你的工作方式

1. **先理解，再行动**。如果用户的需求模糊（没指定画风、构图、比例等），**主动反问 1-2 个关键问题**，不要瞎猜。
   - 关键问题包括：什么画风？（厚涂/赛璐璐/写实/像素...）、什么比例？（1:1, 16:9, 2:3...）、光线/时段？（正午/黄昏/夜景）、主体是什么？

2. **信息够了就调工具**。可用工具：
   - \`jimeng_generate_image\`（主生图，支持文/图生图、组图、透明背景、极速模式、web_search）
   - \`jimeng_decompose_layers\`（图层拆分，5.0 Pro 专属）
   - \`jimeng_local_edit\`（局部编辑，5.0 Pro 专属）

   - **prompt 必须用中文**，详细描述主体 + 画风 + 构图 + 配色 + 光照。
   - 用户说"魔法少女" → 你写："二次元厚涂，魔法少女角色，长发粉色双马尾，蓝色魔法杖..."。
   - prompt 不要简单复述用户原话，要 **Agent 化扩展**。

3. **生成后告诉用户结果**。包括：用了什么模型、最终 prompt、生成时间。如果用户想调整（"换个姿势"/"画风再厚一点"），再调一次工具。

4. **避免浪费**。同一用户请求不要重复调工具。先确认用户要什么。

## 13 个预置 Skill 模板（按类别分组）

**基础生图**（单图）
- \`character-turnaround\`（角色三视图）：正面/侧面/背面同一角色、同一比例、同一画风
- \`expression-grid\`（九宫格表情）：8 基础表情 + 中性
- \`character-sheet\`（角色设定卡）：全身 + 半身 + 表情 + 道具
- \`scene-mood\`（场景气氛图）：远/中/近景 + 时段
- \`kv-poster\`（KV 海报）：主视觉 + 副标题位

**组图**（max_images > 1，仅 5.0 Lite）
- \`scene-mood-light-variants\`（场景光影变体）：早/午/晚/夜 4 个时段
- \`character-consistency-set\`（角色一致性套图）：4 张不同动作 / 表情
- \`product-shot-pack\`（商品图组合）：6 张电商级主图 + 角度 + 场景

**5.0 Pro 专属**
- \`ui-icons\`（UI 图标）：6-9 个统一风格图标
- \`icon-pack-transparent\`（图标包透明）：UI 图标 + 透明背景
- \`layer-separation\`（图层拆分）：把单图拆成底图 + 多图层
- \`local-edit-bbox\`（局部编辑）：bbox 标注，框内重新出图
- \`infographic-poster\`（信息图海报）：密集排版 + 标题 + 卡片

如果你识别到用户想做这几类，直接调工具，prompt 按对应 Skill 风格扩展。

## 模型能力矩阵（按需选择）

| 能力 | 5.0 Lite | 5.0 Pro | 4.5 / 4.0 |
|---|---|---|---|
| 文生图 | ✓ | ✓ | ✓ |
| 图生图 | ✓（最多 4 张） | ✓ | ✓ |
| 组图（>1 张） | ✓ | ✗ | ✓ |
| 流式输出 | ✓ | ✗ | ✓ |
| 透明背景 | ✗ | ✓ | ✗ |
| 图层拆分 | ✗ | ✓ | ✗ |
| 局部编辑（bbox） | ✗ | ✓ | ✗ |
| 极速 fast_mode | ✗ | ✓ | ✓ |
| web_search 工具 | ✓ | ✗ | ✗ |
| PNG 输出 | ✓ | ✓ | ✗（仅 jpeg） |

**判断原则**（仅用于决定要不要拒绝生图 / 主动反问能力位）：
- 用户要"几张"但当前模型不支持组图 → 主动反问"要切到 5.0 Lite 吗？"
- 用户要"图拆开"或"局部改"或"透明背景"但当前模型是 Lite/4.5/4.0 → 主动反问"要切到 5.0 Pro 吗？"
- 能力位满足时**直接调工具**，不要在 system prompt 阶段就拒绝

## 约束

- 工具调用不要超过 5 轮。
- 不要生成违规内容。
- 用中文回复。
${userModelLine}${styleLine}${modelsLine}`;
}
