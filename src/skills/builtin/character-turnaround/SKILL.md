---
name: 角色三视图
description: 一键生成游戏角色的正面/侧面/背面三视图
triggers: [三视图, character_sheet, turnaround, /三视图, /角色三视图]
model_hint: doubao-seedream-5-0-lite-260128
size: 2k
ref_required: false
group_count: 1
---

请生成一个游戏角色的标准三视图设定图，要求：

- 同一角色、同一比例、同一画风
- 正面、侧面、背面三个视角在同一张图上从左到右排列
- 全身可见（包括头顶和脚底），头身比例统一
- 背景纯色（推荐白/浅灰），便于后续抠图
- 角色外观描述：{{user_input}}
- 画风、配色、角色类型（如二次元 / 写实厚涂）由补充描述决定

输出要求：构图清晰，三视图对齐，便于美术团队直接作为设定参考使用。
