#!/usr/bin/env python3
"""Extend asset-payload.ts: add `kind` + `video` fields to BuildAssetPayloadInput,
and the corresponding writes in buildAssetPayload().
"""
import re
from pathlib import Path

PAYLOAD = Path("E:/Pi/Y-agent/src/lib/asset-payload.ts")


def main() -> int:
    s = PAYLOAD.read_text(encoding="utf-8")

    # Add video input field
    if "video?: VideoPayload" not in s:
        old = "  /** P1：组件契约 id。 */\n  componentContractId?: string;\n}"
        new = (
            "  /** P1：组件契约 id。 */\n"
            "  componentContractId?: string;\n"
            "  /** P8：资产类型。图片（缺省）/ 视频。 */\n"
            "  kind?: AssetKind;\n"
            "  /** P8：视频元信息。`kind === \"video\"` 时必传。 */\n"
            "  video?: VideoPayload;\n"
            "}\n"
        )
        s = s.replace(old, new)
        print("extended BuildAssetPayloadInput")

    # Update imports
    if "import type { AssetPayload, GeneratedImage, Usage, AssetKind, VideoPayload }" not in s:
        s = s.replace(
            "import type { AssetPayload, GeneratedImage, Usage } from \"@/lib/types\";",
            "import type {\n  AssetPayload,\n  GeneratedImage,\n  Usage,\n  AssetKind,\n  VideoPayload,\n} from \"@/lib/types\";",
        )
        print("updated imports")

    # Update buildAssetPayload: write kind + video if present
    if "input.kind" not in s:
        # Find the end of buildAssetPayload, right before the final `return payload;`
        # The function structure: const payload: AssetPayload = { urls: input.urls };
        # ... many `if`s
        # return payload;
        # We need to add `if (input.kind) payload.kind = input.kind;` etc before the return
        # Easiest: find the line with `payload.relatedAssetIds` and add after
        old = (
            "  if (input.relatedAssetIds && input.relatedAssetIds.length > 0) {\n"
            "    payload.relatedAssetIds = input.relatedAssetIds;\n"
            "  }\n"
            "  if (input.componentContractId) {\n"
            "    payload.componentContractId = input.componentContractId;\n"
            "  }\n"
            "  return payload;\n"
            "}"
        )
        new = (
            "  if (input.relatedAssetIds && input.relatedAssetIds.length > 0) {\n"
            "    payload.relatedAssetIds = input.relatedAssetIds;\n"
            "  }\n"
            "  if (input.componentContractId) {\n"
            "    payload.componentContractId = input.componentContractId;\n"
            "  }\n"
            "  // P8：资产类型（缺省视为 image，老数据不写此字段以保持兼容）\n"
            "  if (input.kind) {\n"
            "    payload.kind = input.kind;\n"
            "  }\n"
            "  if (input.video) {\n"
            "    payload.video = input.video;\n"
            "  }\n"
            "  return payload;\n"
            "}"
        )
        if old not in s:
            print("WARN: buildAssetPayload end block not found, manual edit needed")
        else:
            s = s.replace(old, new)
            print("extended buildAssetPayload to write kind + video")

    PAYLOAD.write_text(s, encoding="utf-8")
    print(f"updated {PAYLOAD}")
    return 0


if __name__ == "__main__":
    import sys
    sys.exit(main())
