#!/usr/bin/env python3
"""Fix the AssetDetailDialog.tsx that got mangled by the early return splice.

The previous script accidentally removed the original `return (` line. We
need to restore it. Find the end of the video early-return block and re-add
the original `return (` right after.
"""
from pathlib import Path

ADD = Path("E:/Pi/Y-agent/src/components/workspace/AssetDetailDialog.tsx")


def main() -> int:
    s = ADD.read_text(encoding="utf-8")
    if ");  // end video early return" in s:
        print("already fixed")
        return 0

    # The end of my video early return is `}` (closing the if block) followed by blank line and `=> window.removeEventListener`.
    # The splice lost the `return (` of the main function. Let me find where the video block ends.
    # The video block ends with `    );\n  }\n\n  ) => window.removeEventListener(...)` — so the `}\n\n  )` is from the spliced-out `return (`.

    # Strategy: find `  }` (closing if isVideo) followed by `  )` and insert the missing `return (` in between.
    # Specifically: the splice took `  return (`, leaving `  ) => window.removeEventListener` which is the useEffect cleanup.
    # The original line was:
    #   useEffect(() => {
    #     ...
    #     return () => window.removeEventListener(...);
    #   }, [...]);
    # After splice: `  ) => window.removeEventListener(...)` is dangling.

    # I need to reconstruct: insert `return (` before `  ) => window.removeEventListener`.

    old = (
        "  }\n"
        "\n"
        "  ) => window.removeEventListener(\"keydown\", onKey);"
    )
    new = (
        "  }\n"
        "\n"
        "  return (\n"
        "  ) => window.removeEventListener(\"keydown\", onKey);"
    )
    if old not in s:
        print("ERROR: marker not found")
        return 1
    s = s.replace(old, new, 1)
    ADD.write_text(s, encoding="utf-8")
    print("restored return (")
    return 0


if __name__ == "__main__":
    import sys
    sys.exit(main())
