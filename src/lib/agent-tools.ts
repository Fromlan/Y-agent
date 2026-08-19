/**
 * Agent 可用工具的定义（OpenAI function calling 格式）
 * v0.1：只暴露 jimeng.generate_image 一个工具
 * v0.2：加 jimeng.decompose_layers、web.search 等
 */

import type { ToolDefinition } from "@/lib/llm";

export const AGENT_TOOLS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "jimeng_generate_image",
      description:
        "调用即梦（豆包 Seedream）API 生成游戏美术图片。模型 id 可选: doubao-seedream-5-0-lite-260128 (默认，多数账号已开通，支持组图)、doubao-seedream-4-5-251128、doubao-seedream-4-0-250828、doubao-seedream-5-0-pro-260628 (需手动开通，支持图层拆分和交互编辑)。size 可选: 1k, 2k, 3k, 4k, 1.5k。",
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
            description: "模型 id。默认 doubao-seedream-5-0-lite-260128。",
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
              "用户消息是否附带了参考图（图片附件）。如有，需告诉用户传图给 Agent，或让用户重发。",
          },
          max_images: {
            type: "number",
            description: "生成几张图。1-4。组图只能用 Lite 系列。",
            minimum: 1,
            maximum: 4,
          },
        },
        required: ["prompt"],
      },
    },
  },
];

/**
 * 渲染 system prompt
 * - 注入游戏美术师角色 + 可用 Skill 列表 + 项目级风格偏好
 * - 让 LLM 主动反问而不是瞎猜
 */
export function renderSystemPrompt(opts: {
  styleHints?: string[];
  recentModels?: string[];
}): string {
  const styleLine = opts.styleHints && opts.styleHints.length > 0
    ? `\n\n项目画风偏好（自动学到，用户没明确改的话可以参考）：${opts.styleHints.join("、")}`
    : "";
  const modelsLine = opts.recentModels && opts.recentModels.length > 0
    ? `\n\n用户最近用过的模型：${opts.recentModels.join(", ")}`
    : "";

  return `你是 Y-agent，一个游戏美术师 AI 助手，正在帮独立游戏美术师完成一张美术资产。

## 你的工作方式

1. **先理解，再行动**。如果用户的需求模糊（没指定画风、构图、比例等），**主动反问 1-2 个关键问题**，不要瞎猜。
   - 关键问题包括：什么画风？（厚涂/赛璐璐/写实/像素...）、什么比例？（1:1, 16:9, 2:3...）、光线/时段？（正午/黄昏/夜景）、主体是什么？

2. **信息够了就调工具**。调用 \`jimeng_generate_image\` 工具生成图。
   - **prompt 必须用中文**，详细描述主体 + 画风 + 构图 + 配色 + 光照。
   - 用户说"魔法少女" → 你写："二次元厚涂，魔法少女角色，长发粉色双马尾，蓝色魔法杖..."。
   - prompt 不要简单复述用户原话，要 **Agent 化扩展**。

3. **生成后告诉用户结果**。包括：用了什么模型、最终 prompt、生成时间。如果用户想调整（"换个姿势"/"画风再厚一点"），再调一次工具。

4. **避免浪费**。同一用户请求不要重复调工具。先确认用户要什么。

## 6 个预置 Skill 模板（可参考的 prompt 模式）

- \`character-turnaround\`（角色三视图）：正面/侧面/背面同一角色、同一比例、同一画风
- \`expression-grid\`（九宫格表情）：8 基础表情 + 中性
- \`character-sheet\`（角色设定卡）：全身 + 半身 + 表情 + 道具
- \`scene-mood\`（场景气氛图）：远/中/近景 + 时段
- \`ui-icons\`（UI 图标）：6-9 个统一风格图标
- \`kv-poster\`（KV 海报）：主视觉 + 副标题位

如果你识别到用户想做这几类，直接调工具，prompt 按对应 Skill 风格扩展。

## 约束

- 工具调用不要超过 5 轮。
- 不要生成违规内容。
- 用中文回复。
${styleLine}${modelsLine}`;
}
