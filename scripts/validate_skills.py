#!/usr/bin/env python3
"""
Y-agent 内置 Skill 校验脚本

校验 src/skills/builtin/*/SKILL.md 的元数据 + 内容是否合法。
即梦 API 不需要 negative prompt，所以不再强制"反向限制"段；
反向约束统一在每个 skill 的"## Seedream 提示词结构"段里以"反面"列表形式表达。

退出码：
  0 = 全部通过（含只有 warning 的情况）
  1 = 有错误（error 级），CI 阻塞

约定：
  - error   → 阻止 CI merge
  - warning → 不阻止 CI，但本地建议修
  - 校验白名单"model_hint" 来自 src/lib/types.ts 的 MODEL_OPTIONS；脚本内硬编码
    兜底，避免 Python 还要去 import TS。
"""

from __future__ import annotations

import os
import re
import sys
from pathlib import Path
from typing import Iterable

# Windows PowerShell 默认 GBK 会让中文输出乱码。
# 强制 UTF-8 让 stdout 在所有终端正常显示。
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except (AttributeError, OSError):
        pass

# 允许的 model_hint 值（与 src/lib/types.ts 的 MODEL_OPTIONS.id 同步）
ALLOWED_MODEL_HINTS = {
    "doubao-seedream-5-0-lite-260128",
    "doubao-seedream-5-0-260128",  # 5.0 Lite 别名
    "doubao-seedream-4-5-251128",
    "doubao-seedream-4-0-250828",
    "doubao-seedream-5-0-pro-260628",
    "CUSTOM",
}

# ref_required 触发词（模板里必须提到参考图/上传）
REF_KEYWORDS = ("参考图", "上传", "reference", "Reference", "upload")

# group_count > 1 触发词（模板里必须提到多图/组图）
GROUP_KEYWORDS = ("多图", "组图", "group", "Group", "多张", "4 张", "3-4 张", "6-9", "9 宫格", "8 表情", "3 套", "3 张")

# frontmatter 解析（极简：仅支持 `key: value` 与 `key: [a, b]`）
FRONTMATTER_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n(.*)$", re.DOTALL)
KV_RE = re.compile(r"^([a-zA-Z_]+)\s*:\s*(.*)$")

# 解析目录名（basename）
SKILL_DIR_RE = re.compile(r"^builtin/([^/]+)/SKILL\.md$")


def parse_frontmatter(raw: str) -> tuple[dict, str]:
    """从 SKILL.md 文本里抽 frontmatter + 模板正文。返回 (meta, template)."""
    m = FRONTMATTER_RE.match(raw)
    if not m:
        raise ValueError("缺少 --- frontmatter")
    meta_raw, template = m.group(1), m.group(2).strip()
    meta: dict = {}
    for line in meta_raw.splitlines():
        m2 = KV_RE.match(line)
        if not m2:
            continue
        key, val = m2.group(1).strip(), m2.group(2).strip()
        if val.startswith("[") and val.endswith("]"):
            inner = val[1:-1]
            meta[key] = [s.strip().strip("\"'") for s in inner.split(",") if s.strip()]
        else:
            meta[key] = val.strip("\"'")
    return meta, template


def has_ref_keywords(template: str) -> bool:
    return any(kw in template for kw in REF_KEYWORDS)


def has_group_keywords(template: str) -> bool:
    return any(kw in template for kw in GROUP_KEYWORDS)


def validate_one(skill_path: Path) -> list[tuple[str, str]]:
    """校验单个 SKILL.md。返回 [(level, message), ...] 列表。level ∈ {error, warning}."""
    issues: list[tuple[str, str]] = []
    raw = skill_path.read_text(encoding="utf-8")
    try:
        meta, template = parse_frontmatter(raw)
    except ValueError as e:
        issues.append(("error", f"frontmatter 解析失败: {e}"))
        return issues

    sid = skill_path.parent.name  # 用目录名作 id

    # 1) 必含字段
    for required in ("name", "description", "triggers"):
        if not meta.get(required):
            issues.append(("error", f"缺 frontmatter 字段: {required}"))

    # 2) triggers 非空（已经是 list）
    triggers = meta.get("triggers")
    if isinstance(triggers, list) and len(triggers) == 0:
        issues.append(("error", "triggers 列表为空"))
    elif not isinstance(triggers, list):
        issues.append(("error", "triggers 必须为数组（[a, b, ...]）"))

    # 3) model_hint 若声明必须合法
    mh = meta.get("model_hint")
    if mh is not None and mh not in ALLOWED_MODEL_HINTS:
        issues.append(
            ("error", f"model_hint={mh!r} 不在白名单：{sorted(ALLOWED_MODEL_HINTS)}")
        )

    # 4) 模板正文含 {{user_input}} 占位符
    if "{{user_input}}" not in template and "{{ user_input }}" not in template:
        # 已知例外：local-edit-bbox 描述的是"点局部编辑按钮"流程，不调 generateImage
        if sid != "local-edit-bbox":
            issues.append(("warning", "模板不含 {{user_input}} 占位符（仅当 Skill 不直接调生图时可忽略）"))

    # 5) ref_required: true → 模板里必须提到"参考图/上传"
    if str(meta.get("ref_required", "")).lower() == "true":
        if not has_ref_keywords(template):
            issues.append(
                ("warning", "ref_required=true 但模板没提到'参考图/上传'，可能漏写使用说明")
            )

    # 7) group_count > 1 → 模板里必须提到"多图/组图"
    gc = meta.get("group_count")
    if gc is not None:
        try:
            n = int(str(gc).strip())
            if n > 1 and not has_group_keywords(template):
                issues.append(
                    ("warning", f"group_count={n} 但模板没提到'多图/组图'，调用方可能不知情")
                )
        except ValueError:
            issues.append(("error", f"group_count={gc!r} 不是合法整数"))

    return issues


def iter_skill_files(skills_root: Path) -> Iterable[Path]:
    for p in sorted(skills_root.glob("*/SKILL.md")):
        yield p


def main() -> int:
    repo_root = Path(__file__).resolve().parent.parent
    skills_root = repo_root / "src" / "skills" / "builtin"

    if not skills_root.is_dir():
        print(f"[FAIL] 找不到 {skills_root}", file=sys.stderr)
        return 1

    error_count = 0
    warning_count = 0
    skill_count = 0
    seen_ids: dict[str, Path] = {}

    for skill_path in iter_skill_files(skills_root):
        skill_count += 1
        sid = skill_path.parent.name
        # 目录名与 frontmatter.id/name 不强制相等，但目录名不能重复
        if sid in seen_ids:
            print(f"[ERROR] {sid}: 目录名重复（{seen_ids[sid]} vs {skill_path}）")
            error_count += 1
            continue
        seen_ids[sid] = skill_path

        issues = validate_one(skill_path)
        if not issues:
            print(f"[OK]   {sid}")
            continue

        for level, msg in issues:
            print(f"[{level.upper():7}] {sid}: {msg}")
            if level == "error":
                error_count += 1
            else:
                warning_count += 1

    print()
    print(f"扫描 {skill_count} 个 Skill，错误 {error_count}，警告 {warning_count}")
    # 仅 error 阻塞 CI；warning 仅显示给开发者，便于发现但不强制修
    return 1 if error_count else 0


if __name__ == "__main__":
    sys.exit(main())
