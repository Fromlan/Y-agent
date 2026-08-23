#!/usr/bin/env python3
"""Add the video events useEffect to ProjectDetail.tsx.

This is split out from integrate_video_in_project.py because the marker
position changed after other edits.
"""
from pathlib import Path

PD = Path("E:/Pi/Y-agent/src/components/workspace/ProjectDetail.tsx")


def main() -> int:
    s = PD.read_text(encoding="utf-8")
    if "subscribeVideoEvents" in s and "P8：订阅视频事件" in s:
        print("video events useEffect already present, skipping")
        return 0

    # Find the video-key useEffect (with the inputMode dependency) and add the events useEffect after it
    marker = (
        "  // P8：切到生视频模式时检查 video key\n"
        "  useEffect(() => {\n"
        "    if (inputMode === \"video\") {\n"
        "      hasVideoApiKey().then(setHasVideoKey).catch(() => setHasVideoKey(false));\n"
        "    }\n"
        "  }, [inputMode]);"
    )
    if marker not in s:
        print("ERROR: marker not found")
        return 1

    new_block = marker + "\n" + VIDEO_EVENTS_EFFECT
    s = s.replace(marker, new_block, 1)
    PD.write_text(s, encoding="utf-8")
    print("added video events useEffect")
    return 0


VIDEO_EVENTS_EFFECT = (
    "\n"
    "  // P8：订阅视频事件（progress / succeeded / failed / cancelled）\n"
    "  useEffect(() => {\n"
    "    let cancelled = false;\n"
    "    let unlisten: (() => void) | null = null;\n"
    "    const t0 = Date.now();\n"
    "    subscribeVideoEvents({\n"
    "      onProgress: ({ taskId, status }) => {\n"
    "        if (taskId !== videoTaskId) return;\n"
    "        const sec = Math.round((Date.now() - t0) / 1000);\n"
    "        toast.info(`视频生成中… ${sec}s（${status}）`);\n"
    "      },\n"
    "      onSucceeded: async ({ taskId, url, localPath, resolution, duration, ratio }) => {\n"
    "        if (taskId !== videoTaskId) return;\n"
    "        try {\n"
    "          const { buildAssetPayload } = await import(\"@/lib/asset-payload\");\n"
    "          const t1 = Date.now();\n"
    "          await createAsset({\n"
    "            projectId: currentProject.id,\n"
    "            prompt: videoPrompt.trim(),\n"
    "            model: \"MiniMax-H3\",\n"
    "            modelName: \"MiniMax H3 (视频)\",\n"
    "            size: resolution || videoResolution,\n"
    "            refCount: videoContent.filter(\n"
    "              (c) =>\n"
    "                c.type === \"image_url\" ||\n"
    "                c.type === \"video_url\" ||\n"
    "                c.type === \"audio_url\"\n"
    "            ).length,\n"
    "            costMs: Date.now() - t1,\n"
    "            isLayerDecomposition: false,\n"
    "            payload: buildAssetPayload(\n"
    "              {\n"
    "                urls: [],\n"
    "                isTransparent: false,\n"
    "                kind: \"video\",\n"
    "                video: {\n"
    "                  url,\n"
    "                  localPath,\n"
    "                  duration: duration || videoDuration,\n"
    "                  ratio: ratio || videoRatio,\n"
    "                  resolution: (resolution || videoResolution) as \"768P\" | \"2K\",\n"
    "                  taskId,\n"
    "                },\n"
    "                status: \"approved\",\n"
    "              },\n"
    "              undefined\n"
    "            ),\n"
    "          });\n"
    "          await reload({ silent: true });\n"
    "          toast.success(\"视频已生成，已入库到资产库\");\n"
    "        } catch (e: any) {\n"
    "          const raw = e?.message ?? String(e);\n"
    "          const friendly = await explainError(raw).catch(() => raw);\n"
    "          toast.error(`视频入库失败：${friendly}`);\n"
    "        } finally {\n"
    "          setVideoTaskId(null);\n"
    "          setGenerating(false);\n"
    "        }\n"
    "      },\n"
    "      onFailed: async ({ taskId, code, message }) => {\n"
    "        if (taskId !== videoTaskId) return;\n"
    "        const raw = `${code ? `(${code}) ` : \"\"}${message}`;\n"
    "        const friendly = await explainError(raw).catch(() => raw);\n"
    "        toast.error(`视频生成失败：${friendly}`);\n"
    "        setVideoTaskId(null);\n"
    "          setGenerating(false);\n"
    "      },\n"
    "      onCancelled: ({ taskId }) => {\n"
    "        if (taskId !== videoTaskId) return;\n"
    "        toast.info(\"视频生成已取消\");\n"
    "        setVideoTaskId(null);\n"
    "        setGenerating(false);\n"
    "      },\n"
    "    })\n"
    "      .then((u) => {\n"
    "        if (cancelled) u();\n"
    "        else unlisten = u;\n"
    "      })\n"
    "      .catch((e) => console.error(\"subscribeVideoEvents failed\", e));\n"
    "    return () => {\n"
    "      cancelled = true;\n"
    "      if (unlisten) unlisten();\n"
    "    };\n"
    "  }, [videoTaskId, currentProject, videoPrompt, videoContent, videoResolution, videoDuration, videoRatio, toast, reload]);\n"
)


if __name__ == "__main__":
    import sys
    sys.exit(main())
