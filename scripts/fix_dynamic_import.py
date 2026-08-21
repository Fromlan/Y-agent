#!/usr/bin/env python3
"""Replace dynamic import() of asset-payload with a static import in ProjectDetail.tsx."""
from pathlib import Path

PD = Path("E:/Pi/Y-agent/src/components/workspace/ProjectDetail.tsx")


def main() -> int:
    s = PD.read_text(encoding="utf-8")
    # Add static import for buildAssetPayload (alongside the other asset-payload helpers? no, asset-payload is not statically imported yet)
    # Check if it exists
    if 'import { buildAssetPayload } from "@/lib/asset-payload"' in s:
        print("already statically imported, skipping")
        return 0

    # Add the import (next to other lib imports — let's put it right after the `from "@/lib/assets"` import)
    marker = 'import { deleteAsset, backfillLocalAssets, createAsset } from "@/lib/assets";'
    addition = (
        'import { deleteAsset, backfillLocalAssets, createAsset } from "@/lib/assets";\n'
        'import { buildAssetPayload } from "@/lib/asset-payload";'
    )
    s = s.replace(marker, addition)

    # Remove the dynamic import
    s = s.replace(
        'const { buildAssetPayload } = await import("@/lib/asset-payload");\n          ',
        ''
    )

    PD.write_text(s, encoding="utf-8")
    print("static import added, dynamic import removed")
    return 0


if __name__ == "__main__":
    import sys
    sys.exit(main())
