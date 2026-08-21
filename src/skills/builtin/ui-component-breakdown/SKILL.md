---
name: UI 组件拆解
description: 把已批准 UI 页面拆成独立可复用组件（按钮/图标/卡片/装饰），5.0 Pro 透明背景
triggers: [组件拆解, 拆组件, 拆图, UI 拆解, 提取组件, 拆成组件, /组件拆解, /拆组件, /ui-component-breakdown]
model_hint: doubao-seedream-5-0-pro-260628
size: 2k
ref_required: true
group_count: 1
---

把已批准的 UI 页面按"组件"维度拆开，每个组件单独生成 + 透明背景输出。

用户描述（通过 `/UI组件拆解 <描述>` 传入）：{{user_input}}

## 适用场景

- 已经用 `ui-page` 生成了一张 UI 页面，想拆成"按钮、图标、卡片、装饰"等独立素材
- 想做"切图集"：把一张完整 UI 拆成可复用的开发资源
- 想做"风格一致的多张 UI 元素"：从已批准页面继承视觉语言

## 调用方式

1. 用户先有一个 **已批准** 的 UI 页面资产（来自 `ui-page`）
2. 用户描述："`<UI组件拆解> <组件类型> <补充要求>`"
   - 例：`/UI组件拆解 拆出主按钮、关闭按钮、商品卡片 3 个组件`
3. Y-agent 用 5.0 Pro（必须支持 `background=transparent`）
4. 在 prompt 里附"源 page url 作为 image 参考"

## 关键 prompt 模板

```
源参考图（{{source_page_url}}），是已批准的游戏 UI 页面。
请生成以下 {{component_count}} 个独立组件（**PNG 透明背景**）：

1. {{component_1_name}}：{{component_1_desc}}
2. {{component_2_name}}：{{component_2_desc}}
3. {{component_3_name}}：{{component_3_desc}}

## 强制约束
- 每个组件 **单独** 居中（不要排成素材板）
- **PNG 透明背景**（alpha=0，无白底/灰底/网格）
- 画风、描边、圆角、配色、阴影方向与源 page **严格一致**
- 单组件尺寸：{{component_size}}（默认 256x256 / 512x512）
- 安全边距 ≥ 8%（便于裁切）
- 不带文字 / 数字 / 字母（保留排版留白）
- 不附带不透明矩形底
```

## 前置条件（门禁）

- **必须**有已批准的 `ui-page` 资产作为参考图
- `ref_required: true`（用户必须上传源 page 图）
- 5.0 Pro 必选（只有它支持 `background=transparent`）

## 输出要求

- N 张独立 PNG，每张一个组件
- 透明背景（PS 看 alpha 通道 = 0）
- `sourceSkillId = "ui-component-breakdown"`
- `relatedAssetIds = [<源 page id>]`（链回源 page）
- `componentContractId` 暂用源 page id（待 P1 完善 component-contract.yaml 后替换）
- `payload.status = "approved"`（拆分成功即认为已批准）

## 和其它 skill 的关系

| Skill | 区别 |
|---|---|
| `ui-component-breakdown` | 拆"已批准 UI 页面"，基于参考图，**继承源风格** |
| `icon-pack-transparent` | 一次性画 6-9 个图标，**无参考图**，用户描述驱动 |
| `local-edit-bbox` | 在原图上改一块，**不拆**，直接覆盖回原图 |
| `layer-separation` | 用 5.0 Pro 自动抠图层，**不需要 bbox** 标注 |

## Seedream 提示词结构

按官方指南写 prompt（一段连贯自然语言，不要堆词）：

1. **主体 + 行为 + 环境**：明确"把图一（已批准 UI 页面）拆为 N 个独立组件"——是拆解，不是重画
2. **风格 + 色彩 + 光影**：1-3 个关键词，**保持与图一（源 page）完全一致**——继承源风格
3. **明确应用场景**："用作游戏 UI 切图集，给开发作为可复用素材"
4. **如果组件上需要文字**（如按钮文案），把文字放**双引号**
5. **多图参考用"图一"指代源 page**（必传 image dataURL）
6. **多图输出用"系列 N 张"触发**："系列 N 张独立组件 PNG,图二/图三/... 透明背景,各自一个组件居中"

反面：堆砌华丽形容词、组件风格与源 page 漂移、把多个组件粘在一张图。
