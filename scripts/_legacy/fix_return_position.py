#!/usr/bin/env python3
"""Move the misplaced `return (` to its correct position in AssetDetailDialog.tsx.
"""
from pathlib import Path

ADD = Path("E:/Pi/Y-agent/src/components/workspace/AssetDetailDialog.tsx")


def main() -> int:
    s = ADD.read_text(encoding="utf-8")
    # The wrong placement: `  return (\n  ) => window.removeEventListener("keydown", onKey);`
    # We want to move it AFTER the useEffect closes.
    wrong = (
        "  return (\n"
        "  ) => window.removeEventListener(\"keydown\", onKey);\n"
        "  }, [images.length, onClose, viewMode, hiddenLayers]);"
    )
    right = (
        "  ) => window.removeEventListener(\"keydown\", onKey);\n"
        "  }, [images.length, onClose, viewMode, hiddenLayers]);\n"
        "\n"
        "  return ("
    )
    if wrong not in s:
        print("ERROR: wrong placement not found")
        return 1
    s = s.replace(wrong, right, 1)
    ADD.write_text(s, encoding="utf-8")
    print("moved return ( to correct position")
    return 0


if __name__ == "__main__":
    import sys
    sys.exit(main())
