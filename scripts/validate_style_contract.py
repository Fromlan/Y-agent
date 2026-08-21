#!/usr/bin/env python3
"""
Y-agent 项目级风格契约（Style Contract）校验脚本（P1）

设计：style contract 存在 SQLite 的 projects.style_contract JSON 列里，
Python 端不便直接读 SQLite（要保持纯 Python 零依赖）。所以这个脚本的定位
是"文档/导出样本校验"——用户可以：

  1. 从应用导出契约 → 存到 doc/contracts/<projectId>.json
  2. 改完后跑 pnpm run validate:style-contract 校验
  3. CI 在 PR 改动 doc/contracts/ 时跑这个脚本

校验项：
  [error] JSON 解析失败
  [error] version == 1（当前唯一支持版本）
  [error] checksum 字段存在且符合 ^[0-9a-f]{8}$ 格式
  [error] 必填 metadata 字段：created_at (number), updated_at (number)
  [warning] 业务字段值类型校验（art_style 是 string、line_weight 是合法枚举等）
  [error] 重新计算 checksum 与给定值不一致

退出码：
  0 = 全部通过
  1 = 有 error
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

# Windows PowerShell 默认 GBK 会让中文输出乱码。强制 UTF-8。
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except (AttributeError, OSError):
        pass

CHECKSUM_RE = re.compile(r"^[0-9a-f]{8}$")
VALID_LINE_WEIGHTS = {"thin", "medium", "thick"}
VALID_LIGHT_DIRECTIONS = {
    "top",
    "top-left",
    "left",
    "right",
    "top-right",
    "bottom",
}

# 业务字段列表（与 src/lib/style-contract.ts 的 computeChecksum 保持一致）
# 注意：key 顺序必须和 TS 端 businessOnly 对象字面量一致——TS 按对象定义顺序
# 序列化，Python 也会按 dict 迭代顺序。
BUSINESS_FIELDS = (
    "additional",
    "art_style",
    "light_direction",
    "line_weight",
    "palette",
    "reference_asset_ids",
    "version",
)


def compute_checksum(contract: dict) -> str:
    """复现 TS 端 computeChecksum 的算法（用 hashlib 替代 Web Crypto）。"""
    import hashlib
    # 只取业务字段
    business = {k: contract.get(k) for k in BUSINESS_FIELDS}
    # 序列化：与 JS JSON.stringify 默认行为对齐——
    # 不加 ensure_ascii=True 的转义、不加 separator 空格、不排序 keys
    serialized = json.dumps(
        business, ensure_ascii=False, separators=(",", ":"), sort_keys=False
    )
    digest = hashlib.sha256(serialized.encode("utf-8")).digest()
    return digest[:4].hex()


def validate_one(path: Path) -> list[tuple[str, str]]:
    issues: list[tuple[str, str]] = []
    raw = path.read_text(encoding="utf-8")
    try:
        contract = json.loads(raw)
    except json.JSONDecodeError as e:
        issues.append(("error", f"JSON 解析失败：{e}"))
        return issues

    if not isinstance(contract, dict):
        issues.append(("error", f"根节点必须是对象，实际是 {type(contract).__name__}"))
        return issues

    # version
    version = contract.get("version")
    if version != 1:
        issues.append(("error", f"version 必须是 1，实际是 {version!r}"))

    # checksum
    checksum = contract.get("checksum")
    if not isinstance(checksum, str) or not CHECKSUM_RE.match(checksum):
        issues.append(
            ("error", f"checksum 字段必须符合 ^[0-9a-f]{{8}}$，实际是 {checksum!r}")
        )
    else:
        # 重新计算
        expected = compute_checksum(contract)
        if expected != checksum:
            issues.append(
                (
                    "error",
                    f"checksum 不一致：给定 {checksum}，按业务字段重算 {expected}（业务字段改了？漏改 checksum？）",
                )
            )

    # metadata
    for meta in ("created_at", "updated_at"):
        v = contract.get(meta)
        if not isinstance(v, (int, float)) or v < 0:
            issues.append(("error", f"{meta} 必须是正数，实际是 {v!r}"))

    # 业务字段类型校验（warning）
    if "art_style" in contract and not isinstance(contract["art_style"], (str, type(None))):
        issues.append(("warning", f"art_style 应该是 string，实际是 {type(contract['art_style']).__name__}"))

    line_weight = contract.get("line_weight")
    if line_weight is not None and line_weight not in VALID_LINE_WEIGHTS:
        issues.append(
            (
                "warning",
                f"line_weight={line_weight!r} 不在合法集合 {VALID_LINE_WEIGHTS}（前端不会渲染异常，但建议改）",
            )
        )

    light = contract.get("light_direction")
    if light is not None and light not in VALID_LIGHT_DIRECTIONS:
        issues.append(
            (
                "warning",
                f"light_direction={light!r} 不在合法集合 {VALID_LIGHT_DIRECTIONS}（同上，建议改）",
            )
        )

    palette = contract.get("palette")
    if palette is not None:
        if not isinstance(palette, dict):
            issues.append(("warning", f"palette 应该是对象，实际是 {type(palette).__name__}"))
        else:
            for color_name, color_list in palette.items():
                if not isinstance(color_list, list):
                    issues.append(
                        (
                            "warning",
                            f"palette.{color_name} 应该是字符串数组，实际是 {type(color_list).__name__}",
                        )
                    )

    refs = contract.get("reference_asset_ids")
    if refs is not None and not (
        isinstance(refs, list) and all(isinstance(x, str) for x in refs)
    ):
        issues.append(("warning", f"reference_asset_ids 应该是 string[]"))

    return issues


def main() -> int:
    repo_root = Path(__file__).resolve().parent.parent
    contracts_dir = repo_root / "doc" / "contracts"

    if not contracts_dir.is_dir():
        print(f"[WARN] 找不到 {contracts_dir}，跳过（首次运行或还没建样本）")
        return 0

    files = sorted(contracts_dir.glob("*.json"))
    if not files:
        print(f"[WARN] {contracts_dir} 里没有 .json 样本，跳过")
        return 0

    error_count = 0
    warning_count = 0
    for path in files:
        issues = validate_one(path)
        if not issues:
            print(f"[OK]   {path.name}")
            continue
        for level, msg in issues:
            print(f"[{level.upper():7}] {path.name}: {msg}")
            if level == "error":
                error_count += 1
            else:
                warning_count += 1

    print()
    print(f"扫描 {len(files)} 个契约样本，错误 {error_count}，警告 {warning_count}")
    return 1 if error_count else 0


if __name__ == "__main__":
    sys.exit(main())
