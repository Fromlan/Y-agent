#!/usr/bin/env python3
"""Fix TS errors in ProjectDetail.tsx and VideoPromptBar.tsx."""
import re
from pathlib import Path

PD = Path("E:/Pi/Y-agent/src/components/workspace/ProjectDetail.tsx")
VP = Path("E:/Pi/Y-agent/src/components/workspace/VideoPromptBar.tsx")


def main() -> int:
    # === ProjectDetail.tsx ===
    s = PD.read_text(encoding="utf-8")

    # Add createAsset to the lib/assets import
    old = 'import { deleteAsset, backfillLocalAssets } from "@/lib/assets";'
    new = 'import { deleteAsset, backfillLocalAssets, createAsset } from "@/lib/assets";'
    s = s.replace(old, new)

    # Add currentProject null check before createAsset call
    # Match the exact pattern: projectId: currentProject.id,
    pattern = "            projectId: currentProject.id,\n            prompt: videoPrompt.trim(),"
    replacement = "            projectId: currentProject!.id,\n            prompt: videoPrompt.trim(),"
    s = s.replace(pattern, replacement)

    # Add early null-check guard
    # The onSucceeded handler is async; add a top-level check
    on_succeeded_old = "      onSucceeded: async ({ taskId, url, localPath, resolution, duration, ratio }) => {\n        if (taskId !== videoTaskId) return;\n        try {"
    on_succeeded_new = (
        "      onSucceeded: async ({ taskId, url, localPath, resolution, duration, ratio }) => {\n"
        "        if (taskId !== videoTaskId) return;\n"
        "        if (!currentProject) return;\n"
        "        try {"
    )
    s = s.replace(on_succeeded_old, on_succeeded_new)

    PD.write_text(s, encoding="utf-8")
    print(f"fixed {PD}")

    # === VideoPromptBar.tsx ===
    vs = VP.read_text(encoding="utf-8")
    # Remove unused imports
    vs = re.sub(r"\s*Video as VideoIcon,", "", vs)
    vs = re.sub(r"\s*Music,", "", vs)
    # Replace useRef with useState (no useRef usage in the new file)
    vs = vs.replace("useEffect, useState, useRef }", "useEffect, useState }")
    # Remove unused vars
    vs = re.sub(r"\s*const isT2va = scenario === \"t2va\";\n", "\n", vs)
    vs = re.sub(r"\s*const isR2va = scenario === \"r2va\";\n", "\n", vs)
    VP.write_text(vs, encoding="utf-8")
    print(f"fixed {VP}")
    return 0


if __name__ == "__main__":
    import sys
    sys.exit(main())
