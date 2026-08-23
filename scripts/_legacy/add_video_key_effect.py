#!/usr/bin/env python3
"""Manually fix the missing hasVideoKey effect in ProjectDetail.tsx."""
from pathlib import Path

PD = Path("E:/Pi/Y-agent/src/components/workspace/ProjectDetail.tsx")


def main() -> int:
    s = PD.read_text(encoding="utf-8")
    if "P8：切到生视频模式时检查 video key" in s:
        print("already added, skipping")
        return 0
    old = (
        "  // 每次切项目 / 每次生成完都重新检测 API Key\n"
        "  useEffect(() => {\n"
        "    if (!currentProject) return;\n"
        "    hasApiKey().then(setHasKey).catch(() => setHasKey(false));\n"
        "  }, [currentProject, generating]);\n"
    )
    new = (
        "  // 每次切项目 / 每次生成完都重新检测 API Key\n"
        "  useEffect(() => {\n"
        "    if (!currentProject) return;\n"
        "    hasApiKey().then(setHasKey).catch(() => setHasKey(false));\n"
        "    hasVideoApiKey().then(setHasVideoKey).catch(() => setHasVideoKey(false));\n"
        "  }, [currentProject, generating]);\n"
        "\n"
        "  // P8：切到生视频模式时检查 video key\n"
        "  useEffect(() => {\n"
        "    if (inputMode === \"video\") {\n"
        "      hasVideoApiKey().then(setHasVideoKey).catch(() => setHasVideoKey(false));\n"
        "    }\n"
        "  }, [inputMode]);\n"
    )
    if old not in s:
        print("ERROR: marker not found")
        return 1
    s = s.replace(old, new, 1)
    PD.write_text(s, encoding="utf-8")
    print("added hasVideoKey effect")
    return 0


if __name__ == "__main__":
    import sys
    sys.exit(main())
