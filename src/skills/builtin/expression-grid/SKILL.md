---
name: 九宫格表情
description: 生成角色 8 种基础表情 + 中性，共 9 宫格
triggers: [表情, 表情包, expression, /表情, /九宫格, /表情包]
model_hint: doubao-seedream-5-0-lite-260128
size: 1k
ref_required: false
group_count: 1
---

请生成一个游戏角色的 9 宫格表情图，要求：

- 同一角色、同一画风、同一光影
- 9 个格子按 3×3 排列，每格一个表情
- 表情内容：
  - 第 1 行：开心、愤怒、悲伤
  - 第 2 行：惊讶、厌恶、恐惧
  - 第 3 行：害羞、自信、中性
- 头部+肩部特写，背景统一纯色
- 角色描述：{{user_input}}
- 画风保持一致，便于做成 Live2D / Spine 表情切换

输出要求：9 个表情清晰可辨，差异明显，适合直接做表情动画。
