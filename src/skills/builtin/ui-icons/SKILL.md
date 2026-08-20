---
name: UI 图标
description: 一组统一风格的 UI 图标（按钮 / HUD 元素）
triggers: [图标, UI, icon, /图标, /UI]
model_hint: doubao-seedream-5-0-pro-260628
size: 1k
ref_required: false
group_count: 1
---

请生成一组统一风格的 UI 图标，要求：

- 同一画风、同一描边粗细、同一阴影方向、同一配色基调
- 在同一张图上排列 6-9 个图标，常见类型包括：
  - 攻击 / 防御 / 技能 / 道具
  - 血量 / 法力 / 体力
  - 设置 / 背包 / 任务
  - 货币（金币 / 钻石 / 体力）
  - 方向键 / 暂停 / 返回
- 背景透明，便于直接合成到 UI（5.0 Pro + background=transparent + PNG）
- 图标内容：{{user_input}}
- 风格关键词（等距 / 扁平 / 写实 / 像素 / 描边线稿）由补充描述决定

输出要求：图标尺寸一致，可直接打包成 UI 资源使用。

> P4 升级：固定走 5.0 Pro 以支持 `background=transparent`（输出 PNG 透明背景）。
