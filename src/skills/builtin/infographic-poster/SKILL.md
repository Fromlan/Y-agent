---
name: 信息图海报
description: 包含排版/标题/数据可视化的信息图或海报（5.0 Pro 长 prompt 排版）
triggers: [信息图, 海报, 排版, 标题, 数据可视化, /信息图, /海报, /排版]
model_hint: doubao-seedream-5-0-pro-260628
size: 2k
ref_required: false
group_count: 1
---

生成包含排版、标题、图表元素的信息图或海报，5.0 Pro 适合长 prompt 排版（Lite 在密集文字 + 排版上容易乱）。

## 适用场景

- 营销海报（活动公告、新版本发布）
- 教程信息图（"5 步学会 XX"）
- 数据可视化卡片（销售月报、用户增长）
- KV 海报（带 logo / slogan / 主视觉）

## 调用方式

1. 用户提供主题和内容元素（例："6 月活动公告，主题'夏日冒险'，包含：日期、地点、奖品、报名方式"）
2. 用户可选上传参考图（品牌色、logo、风格）
3. Y-agent 用 5.0 Pro（擅长长 prompt + 排版）
4. prompt 明确每个区块的相对位置

## 关键 prompt 模板

```
{{user_topic}}，专业信息图 / 海报排版：
- 顶部标题区：大号粗体标题 + 副标题
- 中央主视觉：{{user_visual}}
- 关键信息卡片：{{user_info_blocks}}（每个卡片有图标 + 标题 + 简短描述）
- 底部 CTA / 联系方式：{{user_cta}}
- 整体风格：{{user_style}}（例：扁平 / 渐变 / 写实 / 复古 / 赛博 / 国潮）
- 色彩：{{user_palette}}
- 字体：{{user_typography}}

保证所有文字清晰可读，元素不重叠，构图有层次。
```

## 注意

- 用 5.0 Pro（擅长长 prompt）
- 单图输出（`group_count: 1`）
- size 推荐 2k（信息图通常 9:16 竖版，但 seedream 主要支持方形 / 横版）
- 5.0 Pro 不支持流式，所以进度反馈慢
- 文字密集的内容（> 200 字）准确率会下降，建议拆成"主视觉 + 几个 callout"的组合
- 排版不正的局部可以用 `local-edit-bbox` Skill 修正
