# M5 · 图层增强(Layer Pro)

> 阶段:M5
> 状态:规划中(未实施)
> 写于:2026-09-07
> 依赖:M2 v0.2.0(5.0 Pro 图层拆分 + LayerCompositeStage + payload.layers + bbox 归一化全链路已就绪)

---

## 1. 目标

把 M2 已落地的"图层合成视图"升级为 **PS 风格图层编辑器**,给独立游戏开发者提供"图层级"控制:

- 隐藏 / 显示 / 锁定 / 解锁图层
- 不透明度滑块(0-100%)
- 图层重排(上移 / 下移 / 置顶 / 置底)
- 单图层导出(PNG 透明)
- 图层命名 + 颜色标签
- 图层组合(多选 + 编组)
- 替换图层(从资产库选图替换当前层)

**用户故事**:
- 美术师拆完图层后,隐藏/锁住背景,只调前景
- 导出某一图层为 PNG,放进游戏引擎
- 替换图层:把"角色"层换成另一个角色

---

## 2. 现状与缺口

### 2.1 已有(可直接复用)

| 资产 | 路径 | 用途 |
|---|---|---|
| `LayerCompositeStage.tsx` | `src/components/workspace/LayerCompositeStage.tsx` | 合成视图主画布(按 bbox 定位) |
| `LayerCompositeThumb.tsx` | 资产卡 mini 缩略图 | Canvas 合成 |
| `layer-view.ts` | `src/lib/layer-view.ts` | 纯函数:`pickVisibleLayers` / `layerRectNormalized` / `canCompositeAssetLayers` / `getBboxHealth` |
| `layer-view.test.ts` | 同目录 | 16+ 个 Vitest 用例 |
| `AssetDetailDialog` | `src/components/workspace/AssetDetailDialog.tsx` | 详情对话框(已有合成/单图层切换) |
| `payload.layers` 全链路 | `src/lib/asset-payload.ts` + SQLite | 16 个字段无损 round-trip |
| Solo + 全部显示 | `LayerCompositeStage.tsx` | 已有基础 |

### 2.2 缺口

1. **不能隐藏图层(只有 solo)**——solo 是互斥的,用户想"隐藏 1 个 + 显示其它"做不到
2. **不能改不透明度**——合成图永远是 100% 不透明,无法调透明叠加
3. **不能重排图层**——图层顺序由 `zIndex` 锁死,无法手动改
4. **不能锁定图层**——鼠标点击永远可选中
5. **不能单图层导出**——只能导出整张合成图
6. **不能命名/标签**——图层 name 来自 API,用户改不了
7. **不能替换图层**——只能用原始 API 返的图
8. **不能多选编组**——只能单独操作

---

## 3. 设计

### 3.1 图层状态(本地,不入库)

新增 `src/lib/layer-editor-state.ts`(纯函数 + useReducer 集成):

```typescript
interface LayerEditorState {
  // 来自 payload.layers 的不可变底图
  base: GeneratedImage;
  layers: GeneratedImage[];

  // 用户操作
  hidden: Set<number>;          // 被隐藏的 layer zIndex
  locked: Set<number>;          // 被锁定的 layer zIndex
  soloed: number | null;        // solo 的 layer zIndex
  opacityByZ: Map<number, number>; // 0-100 不透明度
  reorderedZ: number[] | null;  // 用户重排后的 z 顺序,null = 用 API 顺序
  renamed: Map<number, string>; // 用户重命名
  colorTags: Map<number, string>; // 颜色标签(red / blue / green / ...)
}

// 派生函数
function getEffectiveLayers(state): Array<{ layer, isVisible, isLocked, opacity, displayName, colorTag, effectiveZ }>;

// 序列化(本地存储,跨刷新保留)
function serialize(state): string;
function deserialize(json: string, baseLayers): LayerEditorState;
```

**存储**:
- `localStorage` key = `layer-editor:${assetId}`(每资产一份,1KB 内)
- 不入库(用户编辑是临时的,导出时才落盘)

### 3.2 UI 组件

#### `LayerPanel.tsx`(右侧图层面板,完全重写现有图层面板)

每行:
- 👁 眼睛图标(显示/隐藏)
- 🔒 锁图标(锁定/解锁)
- 缩略图 32×32
- 名称(可双击重命名)
- 不透明度滑块(0-100)
- 颜色标签(下拉,4 选 1)
- 拖拽手柄(重排)
- Solo(Focus 图标,已有)
- 替换图标(从资产库选图)
- 删除图标(M5.6 不做,先放占位)

每行操作:
- 点击行 = 选中(高亮 + 主画布描边)
- Alt+点击 = 多选
- 拖动到另一行 = 重排
- 锁定行不能选中 / 拖动 / 编辑

顶部:
- 全部显示(清空 hidden)
- 全部锁定(批量锁)
- 编组(M5.7 暂不做,占位按钮)

#### 工具栏(主画布顶部)

- 合成 / 单图层 pill(已有)
- 不透明度(整组合成图)
- 替换图层(选中后启用)
- 导出选中为 PNG
- 导出全部为 ZIP

#### 主画布(`LayerCompositeStage.tsx` 升级)

- 隐藏图层:不渲染(已有 solo 路径扩展)
- 不透明度:`opacity` style 应用到 SafeImage 外层 div
- 锁定图层:点击穿透(下一图层接收点击)
- 重排:用 `reorderedZ` 数组排序渲染,而不是 layer 自带 zIndex

### 3.3 导出

#### `LayerExporter.tsx`

- 单图层 PNG:用 `html2canvas` 或手动 Canvas 画 bbox 区域 → `Tauri save dialog` → PNG
- 全部 ZIP:JSZip 打包多张 PNG + manifest.json(各层 bbox / zIndex / name)
- 透明背景:仅 5.0 Pro + 透明背景图层支持

**Rust command**:
- `export_layer_png(asset_id, layer_z_index, dest_path) -> Result<String, String>`
  - 直接读 `assets.payload.layers[].localPaths[z_index]`,转 base64
  - 写到 dest_path
  - 返回写入字节数
- 已有(在 `src-tauri/src/commands.rs`)但未测试,本次加 Vitest + Rust 端 cargo test

### 3.4 替换图层

`LayerReplaceDialog.tsx`:
- 选资产库里的图(只显示 PNG / 透明背景)
- 替换后:更新 `state.renamed` / `opacityByZ`,不直接改 `payload.layers`(临时编辑)
- 重生成时:把这些替换作为新 prompt 输入 5.0 Pro(走 `jimeng.ts` 的 `jimeng_generate_image`,加 `image: [替换图 URL]`)

---

## 4. 阶段分解(可独立发布)

### M5.1 · 隐藏 + 锁定(基础,3 天)

- 眼睛 / 锁图标 + 状态
- `getEffectiveLayers` 派生隐藏 / 锁定
- 主画布不渲染隐藏层
- 锁定层点击穿透
- 验收:AssetDetailDialog 隐藏 1 层后合成图正确,锁后不能选中
- Commit 数:2 个

### M5.2 · 不透明度(2 天)

- 不透明度滑块 + 派生
- 主画布 opacity 样式
- 验收:合成图 2 层不透明度 50%,视觉正确
- Commit 数:1 个

### M5.3 · 重排(3 天)

- 拖拽手柄
- reorderedZ 状态
- 主画布按用户顺序渲染
- 验收:把 2 层和 1 层交换,合成图交换
- Commit 数:2 个

### M5.4 · 重命名 + 颜色标签(2 天)

- 双击重命名
- 4 色下拉
- 验收:名字 / 颜色显示,刷新 localStorage 保留
- Commit 数:1 个

### M5.5 · 单图层导出 + ZIP(4 天)

- LayerExporter
- Rust export_layer_png command + 测试
- JSZip 打包
- 验收:导出 1 张 PNG + 1 个 ZIP 在文件管理器里可打开
- Commit 数:2 个

### M5.6 · 替换图层(3 天)

- LayerReplaceDialog
- 选资产库图 + 应用
- 重生成走 5.0 Pro
- 验收:替换 1 层后重生成,新结果保留替换
- Commit 数:2 个

### M5.7 · 多选编组(可选,后期)

- Alt+点击多选
- 编组按钮
- 验收:2 层编组后隐藏组=同时隐藏 2 层
- Commit 数:2 个

---

## 5. 验收标准

- 7 个用户故事(M5.1-M5.7)全部跑通
- `pnpm test` 新增 35+ 用例(state 派生 / 序列化 / 反序列化)
- `pnpm build` 0 错误
- `cargo test` 0 错误
- 单图层 PNG 导出文件可在 PS 打开
- ZIP 导出 manifest.json 字段齐全(bbox / zIndex / name)
- localStorage 序列化 < 2KB/asset

---

## 6. 风险

| 风险 | 影响 | 应对 |
|---|---|---|
| 拖拽重排 UX 复杂 | 用户搞不清 | 加提示 + 撤销按钮(do/undo stack) |
| 不透明度滑块密集点击卡 | 拖动时主画布抖 | requestAnimationFrame 节流 |
| localStorage 容量(>5MB) | 大量资产编辑态占满 | 序列化压缩 + 最多保留最近 50 个 |
| 替换图层重生成不保留 bbox | 替换后位置漂移 | 把原图 bbox 也作为 prompt 提示 |
| ZIP 导出 16 张图层 1 张 > 1MB | 用户抱怨 | 走 5.0 Pro transparent 已是 PNG,无可压 |
| html2canvas 兼容 Tauri WebView | 截图失败 | 走 Rust 端 PNG 写入(M5.5 已有) |

---

## 7. 涉及文件

### 新建
- `src/lib/layer-editor-state.ts` + `.test.ts`
- `src/lib/layer-exporter.ts` + `.test.ts`
- `src/components/workspace/LayerPanel.tsx`(重写现有)
- `src/components/workspace/LayerReplaceDialog.tsx`
- `src/components/workspace/LayerExportDialog.tsx`
- `src/lib/layer-color-tags.ts`(4 色 palette 注入 Tailwind token)

### 修改
- `src/components/workspace/LayerCompositeStage.tsx`(接 state,渲染 hidden/opacity/reordered)
- `src/components/workspace/AssetDetailDialog.tsx`(替换现有图层面板)
- `src-tauri/src/commands.rs`(`export_layer_png` 已有 + 加 `export_layer_zip`)
- `src-tauri/Cargo.toml`(加 `zip` crate,如有就用已有的,M2 雪碧图切分已加)
- `doc/api-integration.md`(图层编辑器 §)
- `doc/development.md`(M5 段)
- `README.md`(路线图 M5 标 ✅)

### 依赖
- `html2canvas` 或纯 Canvas API(走 `dom-to-image-more` 也可,选最轻的)
- `jszip`(M2 P2 雪碧图切分应该已加,确认)

---

## 8. 估时

- M5.1:3 天
- M5.2:2 天
- M5.3:3 天
- M5.4:2 天
- M5.5:4 天
- M5.6:3 天
- M5.7:2 天(可选)
- **合计**:~2 周(M5.7 可延后)

---

## 9. 与 M2 的依赖

- `payload.layers` 全字段(M2 P2 + 后续 bbox 修复)
- `LayerCompositeStage` 已能按 bbox 合成(M2 P2 + 1.7 修复)
- `payload.localPaths` 24h 兜底(M2 P5)
- `export_layer_png` Rust command(已存在,需补测)
- `zip` crate(M2 P2 雪碧图切分已加)

---

## 10. 暂不做的

- 多选编组(M5.7 后期)
- 图层组嵌套(M5 阶段只做平铺)
- 图层蒙版(M5 不做,需 5.0 Pro 扩展)
- 图层混合模式(正片叠底 / 滤色等,需 5.0 Pro 扩展)
- 图层变换(自由变换 / 缩放 / 旋转,需 5.0 Pro 扩展)
