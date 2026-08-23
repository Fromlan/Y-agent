# scripts/

> 给 AI agent 用的 Python 脚本仓库。手工跑也行，但主要目的是当工程里"批量改 UTF-8 中文 + 复杂 sed 模式"的入口。
>
> **约定**：所有脚本都是幂等的（同一个文件跑两次结果一致），用 UTF-8 无 BOM 写回。

## 文件索引（仍在使用）

| 文件 | 作用 |
|---|---|
| `validate_skills.py` | 校验 `src/skills/builtin/*/SKILL.md` 必填字段（CI 必跑） |
| `validate_style_contract.py` | 校验项目级 style-contract 完整性（CI 必跑） |
| `append_video_commands.py` | 把视频生成相关命令追加到 `src-tauri/src/commands.rs` + 注册到 `lib.rs` + 重写 `state.rs` |
| `append_video_docs.py` | 给 `doc/api-integration.md` 加 Part 7（MiniMax H3 视频 API），更新 `README.md` |
| `add_video_key_to_settings.py` | 在 `SettingsPanel.tsx` 加视频 API Key section + handler |
| `extend_asset_payload.py` | 扩展 `asset-payload.ts` 的 `BuildAssetPayloadInput` + 写 `kind/video` |
| `update_types_video.py` | 给 `types.ts` 加 `AssetKind` / `VideoPayload` 类型 |
| `update_csp.py` | 给 `tauri.conf.json` CSP 加 `media-src` |
| `update_mode_switch.py` | 重写 `ModeSwitch.tsx` 加 "生视频" 选项 |
| `write_video_rs.py` | 重写 `src-tauri/src/video.rs`（UTF-8 安全方式） |

## `_legacy/`（开发期一次性脚本，已完成使命）

> 这些是 v0.2.0 视频功能开发期间迭代用过的脚本，最终功能已合并入主代码。
> 保留作为补丁历史参考，**不在新功能开发里使用**。
> 路径在 `scripts/_legacy/`，单独跑也行（路径硬编码到 `E:/Pi/Y-agent`）：

- `add_video_branches.py` / `add_video_branches_v2.py` — 给 AssetCard/Detail/ResultGrid 加 video 分支
- `add_video_events_effect.py` — 给 ProjectDetail 加视频事件订阅 useEffect
- `add_video_helpers.py` — 视频相关 helper
- `add_video_key_effect.py` — 给 ProjectDetail 加 hasVideoKey effect
- `fix_asset_detail_dialog.py` / `fix_dynamic_import.py` / `fix_return_position.py` / `fix_state_allow.py` / `fix_video_ts_errors.py` / `fix_video_warnings.py` — 各种 build error 小修
- `integrate_video_in_project.py` — 给 ProjectDetail 加视频集成（被拆成多个小脚本）
- `patch_dialog_v3.py` / `patch_dialog_v4.py` / `patch_dialog_v5.py` — 多次失败的 AssetDetailDialog 视频块插入尝试
- `remove_r2va_local_note.py` — 删 r2va 本地视频/音频支持的未来计划文字

## 怎么用

每个脚本都是无参的（路径硬编码到 `E:/Pi/Y-agent`）。直接 `python script_name.py` 即可。

如果跑过一遍后又改回了，可以再跑一次，幂等不会重复追加。

