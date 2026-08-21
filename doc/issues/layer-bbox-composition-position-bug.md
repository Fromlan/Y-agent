# Issue: 图层拆分合成视图位置错位

> **状态**: ✅ 已定位并修复（ToolsTab 图层拆分未保存完整 layers 元数据）
> **创建**: 2026-08-21
> **影响**: 图层拆分(5.0 Pro `layer_decomposition: true`)资产详情对话框的"合成"视图
> **重现概率**: 100%(每次图层拆分都触发)

---

## TL;DR

`LayerCompositeStage` 主画布上,各图层没有按 5.0 Pro API 返回的 `boundingBox.normalized` 摆放 — 视觉上像"全部图层都被放大到撑满 / 叠在中心",而**不是预期的 PS 风格按 bbox 精准定位**。

**已确认**:
- ✅ API 5.0 Pro 返回的 `bounding_box` 数据完全正确(从 log 拿到 7 个图层原始响应值)
- ✅ Rust 端解析 `bounding_box` 字段、`BoundingBox.normalized: Vec<f64>` 都正确
- ✅ 前端 `layerRectNormalized` 纯函数逻辑正确(11+5=16 个 vitest 用例全过)
- ✅ 容器 `aspectRatio` = 底图 base 像素比例(归一化坐标语义正确)
- ❌ **合成视图中图层仍显示为"放大、错位"**

**根因（2026-08-21 定位）**:
- ToolsTab 的「图层拆分」走的是 `runToolSync`，它只把 `resp.images` 的 `url` 存进
  `payload.urls`，**没有把 `zIndex / name / size / boundingBox` 等图层元数据存成
  `payload.layers`**。
- 资产详情 `flatAssetImages()` 发现 `isLayerDecomposition=true` 但没有 `payload.layers`
  时，回退成普通 `urls` 数组；这些图没有 zIndex/bbox，全部被当成 zIndex=0 的底图，
  合成视图 `layerRectNormalized()` 只能回退铺满 → 所以视觉上"全部放大、叠在中心"。
- 主入口（PromptBar/Agent 流程）用 `executePlan` 已经正确保存 `layers`；只有
  ToolsTab 的工具执行器漏了这条分支。SafeImage 的 `block/width/height` 修复不是根因。

**已尝试的修复**:
1. `LayerCompositeStage` SafeImage 加 `className="block w-full h-full"`
2. 全局 `SafeImage` 组件默认加 `display: block + width:100% + height:100%`
3. `LayerBboxMini` 把 `border-2 border-accent` 换成 `box-shadow: inset 0 0 0 1.5px`(解决 indicator 边框被裁)

**用户报告**: 上述修复在重 build + 完全退出 Tauri app 重开后**仍未生效**。所以真实根因可能不在我改过的代码路径上。

> 已入库的旧图层资产如果是在 ToolsTab 生成的（payload 只有 urls、没有 layers），
> 修复后需要**重新执行一次图层拆分**，因为旧库里没有存 bbox/zIndex，无法从已有数据还原。

---

## 1. 问题描述(用户视角)

### 1.1 现象

打开一个图层拆分资产详情(默认进入"合成"视图),主画布显示的合成图**和原图层在源图里的位置不一致**:
- 元素被"放大",不是按 bbox 缩放
- 元素像"叠在中心",而不是按 `boundingBox.normalized` 各归各位
- 选 `Focus` 图标 solo 单图层,仍能看到该图层被放大(而不是只在它 bbox 区域内显示)

### 1.2 用户提供的 log 数据(2026-08-21 02:48 第一次 + 03:07 第二次)

**第一次(7 图层,1k)**:
```json
{
  "data": [
    { "size": "832x1248", "z_index": 0 },  // base
    { "size": "756x1180", "z_index": 1, "bounding_box": {
        "absolute": [38, 35, 794, 1215], "normalized": [46, 28, 953, 973] },
      "name": "深蓝色纯色背景底图" },
    { "size": "485x1062", "z_index": 2, "bounding_box": {
        "absolute": [191, 148, 676, 1210], "normalized": [230, 119, 811, 969] },
      "name": "红发火焰魔法少女主体" },
    { "size": "819x517", "z_index": 3, "bounding_box": {
        "absolute": [507, 581, 618, 651], "normalized": [609, 466, 742, 521] },
      "name": "卷边纸质卷轴" },
    { "size": "287x1351", "z_index": 4, "bounding_box": {
        "absolute": [100, 85, 334, 1183], "normalized": [120, 68, 400, 947] },
      "name": "带火焰的木质法杖" },
    { "size": "714x736", "z_index": 5, "bounding_box": {
        "absolute": [308, 597, 417, 709], "normalized": [370, 478, 500, 567] },
      "name": "棕色皮质挎包" },
    { "size": "389x667", "z_index": 6, "bounding_box": {
        "absolute": [616, 343, 665, 428], "normalized": [740, 275, 798, 342] },
      "name": "悬浮小火焰与火星" }
  ]
}
```

**第二次(5 图层,1k,更简单)**:
```json
{
  "data": [
    { "size": "832x1248", "z_index": 0 },
    { "size": "784x1245", "z_index": 1, "bounding_box": {
        "absolute": [48, 0, 832, 1245], "normalized": [58, 0, 999, 997] } },
    { "size": "444x1062", "z_index": 2, "bounding_box": {
        "absolute": [221, 148, 664, 1210], "normalized": [266, 119, 797, 969] } },
    { "size": "287x1351", "z_index": 3, "bounding_box": {
        "absolute": [101, 85, 334, 1183], "normalized": [121, 68, 400, 947] } },
    { "size": "392x671", "z_index": 4, "bounding_box": {
        "absolute": [616, 343, 666, 428], "normalized": [740, 275, 799, 342] } }
  ]
}
```

**Rust 解析端**(`y_agent_lib::jimeng`)收到的样本:
```
data.len=7, sample_bboxes=[
  (Some(0), None, Some("832x1248"), None),
  (Some(1), Some("深蓝色纯色背景底图"), Some("756x1180"),
   Some((Some([38.0, 35.0, 794.0, 1215.0]), Some([46.0, 28.0, 953.0, 973.0])))),
  (Some(2), Some("红发火焰魔法少女主体"), Some("485x1062"),
   Some((Some([191.0, 148.0, 676.0, 1210.0]), Some([230.0, 119.0, 811.0, 969.0]))))
]
```

→ **数据链路 OK,Rust 收到的 bbox 完全正确**。

### 1.3 对比:期望 vs 实际

| 图层 | normalized bbox | 期望位置 | 实际看到(用户报告) |
|---|---|---|---|
| 1. 背景 | 几乎全画布 | 整个画布 | ✓ 正确(深蓝底色) |
| 2. 角色 | 23-81% × 12-97% | 中央偏左 | ✗ 看起来被放大、可能位置也错 |
| 3. 卷轴 | 61-74% × 47-52% | 右上小区域 | — 不在视野内可能被遮 |
| 4. 法杖 | 12-40% × 7-95% | 左侧细长 | ✗ 不像"细长",可能显示为大色块 |
| 5. 挎包 | 37-50% × 48-57% | 中央偏下小区域 | ✗ 看起来是个"巨大棕色块"覆盖大半 |
| 6. 悬浮火焰 | 74-80% × 28-34% | 右上小区域 | ✗ 看到"巨大火焰"在底部中央 |

---

## 2. 数据流(已确认正确)

```
5.0 Pro API
  └─ resp.data[].{url, z_index, size, output_format,
                  bounding_box.{absolute, normalized}, name, description}
       │
       ▼ Rust 解析 — src-tauri/src/jimeng.rs:226-262
  ApiImage.bounding_box: Option<BoundingBox>
       │   #[serde(rename = "bounding_box")] 解 snake_case
       │   BoundingBox { absolute: Option<Vec<f64>>, normalized: Option<Vec<f64>> }
       │
       ▼ 序列化为 camelCase — src-tauri/src/jimeng.rs:264-293
  GeneratedImage (with #[serde(rename_all = "camelCase")])
       → boundingBox: { absolute?: f64[], normalized?: f64[] }
       │
       ▼ Tauri IPC → 前端 — src/lib/types.ts:177-215
  GeneratedImage.boundingBox: BoundingBox
       │
       ▼ buildAssetPayload — src/lib/asset-payload.ts:96-98
  AssetPayload.layers = GeneratedImage[]  (with boundingBox)
       │
       ▼ flatAssetImages — src/lib/types.ts:264-275
  按 zIndex 升序排: [base, layer1, layer2, ...]
       │
       ▼ LayerCompositeStage.tsx:194 → layerRectNormalized(img)
  纯函数转换:
    n = boundingBox.normalized / 1000  →  [left, top, right, bottom] (0-1 floats)
    n.width = r - l
    n.height = b - t
       │
       ▼ LayerCompositeStage.tsx:198-205 渲染
  <div className="absolute" style={{
    left: `${n.left * 100}%`,
    top: `${n.top * 100}%`,
    width: `${n.width * 100}%`,
    height: `${n.height * 100}%`,
  }}>
    <SafeImage src=... className="block w-full h-full"
               style={{ objectFit: "contain" }} />
  </div>
       │
       ▼ 容器: <div style={{ aspectRatio: '${base.w} / ${base.h}' }}>
  底图真实比例 → 归一化坐标语义正确(无论对话框渲染尺寸如何)
```

**测试覆盖**:
- `src/lib/layer-view.test.ts`: 11 个 `layerRectNormalized` 用例 + 5 个 `getBboxHealth` 用例,覆盖正常/缺失/越界/反向/NaN/底图豁免等场景
- `src/lib/asset-payload.test.ts`: 3 个 IPC shape round-trip 用例(整数/浮点/16 层),断言 bbox 字段无损
- `cargo check`: Rust 端编译通过

---

## 3. 已尝试的修复(均未在用户环境生效)

### 3.1 修复 1: LayerBboxMini 的 `border` 被 `overflow-hidden` 裁掉

**文件**: `src/components/workspace/AssetDetailDialog.tsx:LayerBboxMini`
**改动**: `border-2 border-accent` (外边框) → `box-shadow: inset 0 0 0 1.5px` (内阴影)
**状态**: ✅ 修对了 indicator 边框被裁问题(右图 32x32 红框应填满)
**但**: 用户报告右边仍是旧版,说明这个组件根本没生效(可能根本没重新构建)

### 3.2 修复 2: SafeImage 全局加 `display: block`

**文件**: `src/components/shared/SafeImage.tsx`
**改动**:
- 加 `unconstrained?: boolean` prop(默认 false)
- 默认给 `<img>` 加 `block` class + `width: 100%; height: 100%` style
- 99% 用例不用手动加 `block`,少数 inline text 流嵌入可传 `unconstrained: true`

**理论**: `<img>` 默认 `display: inline-block`,部分浏览器在图片加载前会回退到"天然宽高"作为布局占位。当图层 PNG 天然尺寸(如 287×1351)远大于父容器 bbox(如 27.9%×87.9% = ~180×560px)时,图片按天然尺寸渲染,溢出后被外层 `overflow-hidden` 裁掉 → 视觉上"图层被放大到撑满"。

**状态**: ❌ 用户报告 build 后**主画布仍未正确**。`block` 修复可能不够,或 build 没生效。

### 3.3 修复 3: 用户 build 尝试失败

**用户命令**: `.\build-with-msvc.cmd` (没传参数)
**结果**: cargo 报 help 文本(没真正 build),`dist/` 仍是 10:31 的旧版
**根因**: `build-with-msvc.cmd` 只是 `cargo %*` 的封装,没参数 = `cargo` 无参数 = help
**正确命令**:
- 完整 Tauri 打包: `.\build-installer.cmd` (5-15 分钟)
- 只重打前端: `pnpm build` (但不会更新已装 Tauri app 的二进制)
- 开发模式: `.\dev-with-msvc.cmd` (HMR 立即生效)

---

## 4. 根因假设(按可能性排序)

### 假设 A (高): 真正根因不是 `<img>` 天然尺寸,而是别的

**证据**:
- 即使加了 `block + 100%`,用户报告仍错位
- 用户看到的是"被放大" + "位置错",不只是尺寸错

**可能子因**:
1. **layer div 本身的 `position: absolute + left/top` 没生效** — 比如父容器没 `position: relative`,但代码确实有
2. **百分比计算错误** — 比如父容器尺寸不是预期的 640px 宽
3. **`n` 值本身是错的** — 比如 Rust 给前端传了 base64 字符串而不是数组(序列化错乱),前端 `n.map(v => v/1000)` 直接崩了,但 UI 没报错
4. **多个图层 div 互相覆盖** — 比如每个图层的 `z-index` 错了,后渲染的覆盖前面的

**验证方法**: 在 Tauri WebView 打开 DevTools(`Ctrl+Shift+I`),对合成视图里某个 layer div 检查:
- `offsetWidth / offsetHeight` 应该是 bbox 百分比对应的 px
- `style.left / style.top` 应该是 `XX%` 字符串
- 如果 div 实际尺寸是 100%×100%(铺满),那是父容器问题
- 如果 div 实际尺寸正确但 `<img>` 充满,那是 SafeImage 问题

### 假设 B (中): 用户跑的是 prod 安装版,从未 build 过

**证据**:
- `dist/` mtime = 10:31(用户的首次 build 尝试前)
- 用户重 build 的命令实际没跑(参数错)
- 用户"完全退出 Tauri app 重开"对 prod 二进制无效

**可能子因**:
- Tauri app 启动时把 `dist/` 资源嵌进 Rust 二进制,prod 用户必须 `.\build-installer.cmd` 重 build + 重装才能看到新代码
- 用户的 `dev-with-msvc.cmd` 从未跑过(一直在用装好的 prod 版本)

**验证方法**: 问用户"你这次是怎么跑 Tauri app 的?",预期回答应该是 `.\dev-with-msvc.cmd`,如果不是,需要切到 dev 模式验证修复

### 假设 C (中): `imageInput(img)` 用了错的 localPath

**证据**:
- Rust 端 P5 后置逻辑会下载 URL 到本地缓存,可能写错 localPath(顺序错位)
- 如果 layer1 的 localPath 指向 layer2 的图,合成时位置就全乱了

**可能子因**:
- `src-tauri/src/commands.rs` `extract_urls_for_backfill` 函数:用 `payload.layers` 数组顺序取 URL,跟 `z_index` 排序可能不一致
- 兜底下载时按 index 写 localPath,但 layers 数组顺序 ≠ zIndex 顺序

**验证方法**:
- log 里看每张图的 `url` 末尾 hash
- 对比 SQLite 里 `payload.layers[i].localPath` 指向的文件 hash
- 验:打开 solo 第 3 层(法杖),看到的图是法杖 PNG 还是别的

### 假设 D (低): Vite/Tailwind 没生成 `block` / `w-full` / `h-full` 的 CSS

**证据**:
- Tailwind 默认会扫所有源文件,JIT 生成实际用到的 class
- `block` / `w-full` / `h-full` 应该是基础 class,不可能没生成

**验证方法**: 在 DevTools 里看 `<img>` 的 `computed style`,确认 `display: block; width: 100%; height: 100%` 真的应用上了

### 假设 E (低): React 19 strict mode 双重渲染导致 div 被插队

**证据**:
- 不太可能
- 但 strict mode 会调用 useEffect 两次,可能影响 SafeImage 的 async 解析

**验证方法**: 看 `src/main.tsx` 是不是 `<React.StrictMode>` 包裹

---

## 5. 调试清单(下一步必做)

### 5.1 用户需要做的(在 dev 模式跑)

1. **确认跑的是 dev 模式**:
   ```powershell
   Set-Location 'E:\Pi\Y-agent'
   .\dev-with-msvc.cmd
   ```
   (会启动 Vite + 编译 Rust + 打开 Tauri 窗口)

2. **Tauri 窗口打开后**:
   - `Ctrl+Shift+I` 打开 WebView DevTools
   - 切到 Elements 面板,选中合成视图里 `<div class="absolute">` 的某个 layer div
   - 看 `offsetWidth / offsetHeight` 是否等于 bbox 对应像素
   - 看 `style` 是 `left: 23%` 还是 `left: 0px`

3. **截屏 / 报告**:
   - 主画布现在的合成结果
   - 某个 layer div 的 DevTools 截图
   - React DevTools 里 `<LayerCompositeStage>` 的 `layers` prop 实际值

### 5.2 如果 dev 模式修对了 → 是 build 问题

- 用户一直跑 prod 安装版,需要 `.\build-installer.cmd` 重 build + 重装
- 或者后续开发都切到 dev 模式

### 5.3 如果 dev 模式还是错 → 找真正的根因

- 看 DevTools 里 layer div 的实际尺寸
- 看 `<img>` 元素的 naturalWidth/Height
- 看 SafeImage 解析出的 src 实际指向哪个文件

---

## 6. 关键文件位置

| 文件 | 角色 | 当前状态 |
|---|---|---|
| `src/components/workspace/LayerCompositeStage.tsx` | 合成视图渲染主体 | SafeImage 已加 `block` |
| `src/components/workspace/AssetDetailDialog.tsx` | 详情对话框 | LayerBboxMini 用 inset shadow |
| `src/components/shared/SafeImage.tsx` | 全局 img 包装 | 默认加 `block + 100%` |
| `src/components/workspace/AssetCard.tsx` | 资产卡 mini 缩略图 | SafeImage 已加 `block` |
| `src/lib/layer-view.ts` | bbox 归一化纯函数 | 16 个 vitest 用例覆盖 |
| `src/lib/asset-payload.ts` | 入库 payload 构造 | round-trip 测试覆盖 |
| `src-tauri/src/jimeng.rs` | Rust API 解析 | `BoundingBox.normalized: Vec<f64>` |
| `src-tauri/src/commands.rs` | 资产入库/读出 | write_local_paths_to_payload 有 debug log |
| `doc/api-integration.md` § 1.7.2 | API 文档 + 排错指南 | 已更新 |

---

## 7. 参考资料

### 7.1 5.0 Pro API 官方文档
- 火山方舟 Seedream 5.0 pro 教程(本地副本):`doc/Doubao Seedream 5.0 pro 教程.md`
- 图层拆分 § `layer_decomposition` 段:返回底图 + 最多 16 图层,每层带 `z_index` / `name` / `description` / `bounding_box.{absolute, normalized}`
- `bounding_box.absolute`:输出底图坐标系绝对像素 `[left, top, right, bottom]`
- `bounding_box.normalized`:0-1000 归一化,适用于将图层还原到任意尺寸的自定义画布

### 7.2 内部代码
- `src/lib/layer-view.ts:90-103` `layerRectNormalized` — bbox 转换纯函数
- `src/lib/layer-view.test.ts:112-170` — 11+5 个 vitest 用例
- `src/lib/asset-payload.test.ts:161-222` — round-trip 测试
- `src/components/workspace/LayerCompositeStage.tsx:192-244` — 合成渲染主体
- `src-tauri/src/jimeng.rs:226-262` — Rust 端 BoundingBox 解析
- `doc/api-integration.md:1.7.2` — 排错指南(已更新)

### 7.3 类似的已知 issue / 排查参考
- CSS `<img>` `inline-block` 默认值的渲染陷阱 — 多个开源 issue 提到,典型表现是图片溢出父容器被裁剪
- 解决方案:加 `display: block` 或显式 `width: 0; height: 0` 属性
- 参考: https://github.com/facebook/react/issues/11379 (类似的 img natural size 问题)

### 7.4 排查历史 log 样本
- 用户第一次(7 图层):`{ "name": "将图像拆分为底图与可编辑图层" }`, 1k 尺寸, 47.44s
- 用户第二次(5 图层):`{ "name": "将图像拆分为底图与可编辑图层" }`, 1k 尺寸, 49.23s
- Rust 端日志前缀:`y_agent_lib::jimeng`

---

## 8. 临时建议(用户可立即尝试)

如果想快速看到 SafeImage `block` 修复是否生效,**不要**靠 prod Tauri app。改用:

```powershell
# 1. 在 dev 模式启动(会自动 HMR)
Set-Location 'E:\Pi\Y-agent'
.\dev-with-msvc.cmd
```

打开任一层图拆分资产 → 看右侧 32x32 缩略图的红框:
- ✅ **新版**(修复生效):红框几乎填满 32x32(因为 bbox 几乎全画布)
- ❌ **旧版**:红框在角落、小方块

如果新版效果对,说明修复 OK,问题就是 prod 没 build。

如果新版还错,说明 SafeImage 修复不够,需要走 § 5.3 的深度排查路径。
