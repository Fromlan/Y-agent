# scripts/

> 给 AI agent 用的 Python 脚本仓库。手工跑也行,但主要目的是当工程里"批量改 UTF-8 中文 + 复杂 sed 模式"的入口。
>
> **约定**:所有脚本都是幂等的(同一个文件跑两次结果一致),用 UTF-8 无 BOM 写回。

## 文件索引(仍在使用)

| 文件 | 作用 |
|---|---|
| `validate_skills.py` | 校验 `src/skills/builtin/*/SKILL.md` 必填字段(CI 必跑) |
| `validate_style_contract.py` | 校验项目级 style-contract 完整性(CI 必跑) |

## `_legacy/`(v0.2.0 视频功能 bootstrap 历史)

> 这些是 v0.2.0 视频功能开发期间一次性跑过、任务已完成的脚本(改 Rust 端 / 加 video 命令块 / 加 CSP `media-src` / 改 ModeSwitch 加 video 选项 等)。
> 功能已合并到主代码,不会再重跑;**新功能开发不要用**。
> 路径全部硬编码到 `E:/Pi/Y-agent`,文件本身已统一在 `_legacy/`,单独跑也行(从仓库根目录执行 `python scripts/_legacy/<name>.py`)。

| 文件 | 作用 |
|---|---|
| `append_video_commands.py` | 把视频生成相关命令追加到 `src-tauri/src/commands.rs` + 注册到 `lib.rs` + 重写 `state.rs` |
| `append_video_docs.py` | 给 `doc/api-integration.md` 加 Part 7(MiniMax H3 视频 API),更新 `README.md` |
| `add_video_key_to_settings.py` | 在 `SettingsPanel.tsx` 加视频 API Key section + handler |
| `add_video_branches_v2.py` | 给 AssetCard/Detail/ResultGrid 加 video 分支(早期 v1 失败被 v2 替代) |
| `add_video_events_effect.py` | 给 ProjectDetail 加视频事件订阅 useEffect |
| `add_video_helpers.py` | 视频相关 helper |
| `add_video_key_effect.py` | 给 ProjectDetail 加 hasVideoKey effect |
| `extend_asset_payload.py` | 扩展 `asset-payload.ts` 的 `BuildAssetPayloadInput` + 写 `kind/video` |
| `fix_asset_detail_dialog.py` / `fix_dynamic_import.py` / `fix_return_position.py` / `fix_state_allow.py` / `fix_video_ts_errors.py` / `fix_video_warnings.py` | 各种 build error 小修 |
| `integrate_video_in_project.py` | 给 ProjectDetail 加视频集成(被拆成多个小脚本) |
| `remove_r2va_local_note.py` | 删 r2va 本地视频/音频支持的未来计划文字 |
| `update_csp.py` | 给 `tauri.conf.json` CSP 加 `media-src` |
| `update_mode_switch.py` | 重写 `ModeSwitch.tsx` 加 "生视频" 选项 |
| `update_types_video.py` | 给 `types.ts` 加 `AssetKind` / `VideoPayload` 类型 |
| `write_video_rs.py` | 重写 `src-tauri/src/video.rs`(UTF-8 安全方式) |

## 怎么用

每个脚本都是无参的(路径硬编码到 `E:/Pi/Y-agent`)。直接 `python script_name.py` 即可。

如果跑过一遍后又改回了,可以再跑一次,幂等不会重复追加。
