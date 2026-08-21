#!/usr/bin/env python3
"""Integrate video mode into ProjectDetail.tsx.

Changes:
1. Add imports for video client + VideoPromptBar
2. Add video-specific state (videoPrompt, videoContent, videoResolution, etc.)
3. Add onSubmitVideo handler
4. Add useEffect to subscribe to jimeng_video://* events
5. Update tab sync to handle inputMode === "video"
6. Update onSubmit switch
7. Render VideoPromptBar in bottom area when inputMode === "video"
"""
import re
from pathlib import Path

PD = Path("E:/Pi/Y-agent/src/components/workspace/ProjectDetail.tsx")


def main() -> int:
    s = PD.read_text(encoding="utf-8")

    # 1. Add imports after existing ones
    if "from \"@/lib/video\"" not in s:
        old_imp = 'import { confirmDialog } from "@/lib/dialog";'
        new_imp = (
            'import { confirmDialog } from "@/lib/dialog";\n'
            'import VideoPromptBar from "@/components/workspace/VideoPromptBar";\n'
            'import {\n'
            '  submitVideo,\n'
            '  cancelVideo,\n'
            '  hasVideoApiKey,\n'
            '  subscribeVideoEvents,\n'
            '  validateAndFixParams,\n'
            '  type ContentItem,\n'
            '  type VideoRatio,\n'
            '  type VideoResolution,\n'
            '} from "@/lib/video";'
        )
        s = s.replace(old_imp, new_imp)
        print("added video imports")

    # 2. Add video state right after `const [transparent, setTransparent] = useState(false);`
    if "videoPrompt" not in s:
        old_state = (
            "  const [transparent, setTransparent] = useState(false);\n"
            "\n"
            "  // 输入模式：生图（M1 直调）/ 对话（Agent 路由）\n"
            "  const [inputMode, setInputMode] = useState<InputMode>(\"chat\");"
        )
        new_state = (
            "  const [transparent, setTransparent] = useState(false);\n"
            "\n"
            "  // P8：生视频模式状态（与生图解耦）\n"
            "  const [videoPrompt, setVideoPrompt] = useState(\"\");\n"
            "  const [videoContent, setVideoContent] = useState<ContentItem[]>([]);\n"
            "  const [videoResolution, setVideoResolution] = useState<VideoResolution>(\"2K\");\n"
            "  const [videoDuration, setVideoDuration] = useState<number>(5);\n"
            "  const [videoRatio, setVideoRatio] = useState<VideoRatio | \"auto\">(\"16:9\");\n"
            "  const [videoWatermark, setVideoWatermark] = useState(false);\n"
            "  const [hasVideoKey, setHasVideoKey] = useState<boolean | null>(null);\n"
            "  const [videoTaskId, setVideoTaskId] = useState<string | null>(null);\n"
            "\n"
            "  // 输入模式：生图（M1 直调）/ 对话（Agent 路由）\n"
            "  const [inputMode, setInputMode] = useState<InputMode>(\"chat\");"
        )
        s = s.replace(old_state, new_state)
        print("added video state")

    # 3. Update hasKey effect to also load hasVideoKey
    if "hasVideoApiKey" not in s:
        old = (
            "  // 每次切项目 / 每次生成完都重新检测 API Key\n"
            "  useEffect(() => {\n"
            "    if (!currentProject) return;\n"
            "    hasApiKey().then(setHasKey).catch(() => setHasKey(false));\n"
            "  }, [currentProject, generating]);"
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
            "  }, [inputMode]);"
        )
        s = s.replace(old, new)
        print("added hasVideoKey effect")

    # 4. Update tab sync to handle video mode
    if "inputMode === \"video\"" not in s:
        old = (
            "    setTab(inputMode === \"tools\" ? \"tools\" : inputMode === \"generate\" ? \"assets\" : \"chat\");\n"
            "  }, [currentProject, inputMode]);"
        )
        new = (
            "    setTab(\n"
            "      inputMode === \"tools\"\n"
            "        ? \"tools\"\n"
            "        : inputMode === \"generate\" || inputMode === \"video\"\n"
            "        ? \"assets\"\n"
            "        : \"chat\"\n"
            "    );\n"
            "  }, [currentProject, inputMode]);"
        )
        s = s.replace(old, new)
        print("updated tab sync to include video")

    # 5. Add useEffect to subscribe to video events (place it after other useEffects)
    # We put it right after the hasApiKey effect we just modified
    if "subscribeVideoEvents" not in s:
        # Find the hasApiKey useEffect and append after it
        # It's the one that calls hasApiKey().then(setHasKey)...
        # We'll insert the video events useEffect after the "P8：切到生视频模式时检查 video key" useEffect
        marker = (
            "    if (inputMode === \"video\") {\n"
            "      hasVideoApiKey().then(setHasVideoKey).catch(() => setHasVideoKey(false));\n"
            "    }\n"
            "  }, [inputMode]);"
        )
        video_effect = (
            "    if (inputMode === \"video\") {\n"
            "      hasVideoApiKey().then(setHasVideoKey).catch(() => setHasVideoKey(false));\n"
            "    }\n"
            "  }, [inputMode]);\n"
            "\n"
            "  // P8：订阅视频事件（progress / succeeded / failed / cancelled）\n"
            "  useEffect(() => {\n"
            "    let cancelled = false;\n"
            "    let unlisten: (() => void) | null = null;\n"
            "    const t0 = Date.now();\n"
            "    subscribeVideoEvents({\n"
            "      onProgress: ({ taskId, status }) => {\n"
            "        if (taskId !== videoTaskId) return;\n"
            "        // 进度：toast 显示「生成中… Xs」\n"
            "        const sec = Math.round((Date.now() - t0) / 1000);\n"
            "        toast.info(`视频生成中… ${sec}s（${status}）`);\n"
            "      },\n"
            "      onSucceeded: async ({ taskId, url, localPath, resolution, duration, ratio }) => {\n"
            "        if (taskId !== videoTaskId) return;\n"
            "        // 入库视频资产\n"
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
            "        setGenerating(false);\n"
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
            "  }, [videoTaskId, currentProject, videoPrompt, videoContent, videoResolution, videoDuration, videoRatio, toast, reload]);"
        )
        s = s.replace(marker, video_effect, 1)
        print("added video events useEffect")

    # 6. Add onSubmitVideo + onCancelVideo handlers before the onSubmit switch
    if "onSubmitVideo" not in s:
        marker = "  const onSubmit = inputMode === \"chat\" ? onSubmitChat : onSubmitGenerate;"
        new = (
            "  // P8：生视频提交（异步任务模式）\n"
            "  const onSubmitVideo = async () => {\n"
            "    if (generating) return;\n"
            "    if (!videoPrompt.trim()) {\n"
            "      toast.warn(\"请输入提示词\");\n"
            "      return;\n"
            "    }\n"
            "    if (hasVideoKey === false) {\n"
            "      toast.error(\"未配置视频 API Key，请到设置里填\");\n"
            "      onOpenSettings();\n"
            "      return;\n"
            "    }\n"
            "    // v1：单项目同时只允许 1 个视频任务\n"
            "    if (videoTaskId) {\n"
            "      toast.warn(\"上一个视频还没生成完\");\n"
            "      return;\n"
            "    }\n"
            "    setGenerating(true);\n"
            "    try {\n"
            "      const fixedRatio = videoRatio === \"auto\" ? undefined : videoRatio;\n"
            "      const finalContent: ContentItem[] = [\n"
            "        ...videoContent,\n"
            "        { type: \"text\", text: videoPrompt.trim() },\n"
            "      ];\n"
            "      const check = validateAndFixParams({\n"
            "        model: \"MiniMax-H3\",\n"
            "        content: finalContent,\n"
            "        resolution: videoResolution,\n"
            "        duration: videoDuration,\n"
            "        ratio: fixedRatio,\n"
            "        aigcWatermark: videoWatermark || undefined,\n"
            "      });\n"
            "      if (!check.ok) {\n"
            "        toast.warn(check.reason);\n"
            "        setGenerating(false);\n"
            "        return;\n"
            "      }\n"
            "      const taskId = await submitVideo(check.fixed, currentProject.id);\n"
            "      setVideoTaskId(taskId);\n"
            "      toast.info(\"视频已提交，异步生成中…\");\n"
            "      // 切到 assets tab 让用户看到结果\n"
            "      if (tab !== \"assets\") setTab(\"assets\");\n"
            "      // 清空 prompt（保留素材，让用户能快速重试微调）\n"
            "      setVideoPrompt(\"\");\n"
            "    } catch (e: any) {\n"
            "      const raw = e?.message ?? String(e);\n"
            "      const friendly = await explainError(raw).catch(() => raw);\n"
            "      toast.error(friendly);\n"
            "      setGenerating(false);\n"
            "    }\n"
            "  };\n"
            "\n"
            "  const onCancelVideo = async () => {\n"
            "    if (!videoTaskId) return;\n"
            "    try {\n"
            "      await cancelVideo(videoTaskId);\n"
            "    } catch (e: any) {\n"
      "      console.warn(\"cancelVideo failed\", e);\n"
            "    }\n"
            "  };\n"
            "\n"
            "  const onSubmit = inputMode === \"chat\" ? onSubmitChat : inputMode === \"video\" ? onSubmitVideo : onSubmitGenerate;"
        )
        s = s.replace(marker, new)
        print("added onSubmitVideo + onCancelVideo")

    # 7. Update the bottom bar to render VideoPromptBar when inputMode === "video"
    # The current code has: {inputMode !== "tools" && (<PromptBar ... />)}
    # We need: {inputMode === "video" ? (<VideoPromptBar .../>) : inputMode !== "tools" && (<PromptBar .../>)}
    if "VideoPromptBar" not in s or "videoPrompt" not in s.split('VideoPromptBar')[1] if 'VideoPromptBar' in s else True:
        # The check above is fragile, just check the obvious marker
        if '<VideoPromptBar' not in s:
            # Find the existing PromptBar block and wrap it
            # The structure: {inputMode !== "tools" && ( <PromptBar ... onSubmit={onSubmit} /> )}
            # We'll change the outer block
            old = (
                "        {inputMode !== \"tools\" && (\n"
                "        <PromptBar\n"
                "          prompt={prompt}\n"
                "          setPrompt={setPrompt}\n"
                "          refs={refs}\n"
                "          setRefs={setRefs}\n"
                "          model={model}\n"
                "          setModel={setModel}\n"
                "          size={size}\n"
                "          setSize={setSize}\n"
                "          groupCount={groupCount}\n"
                "          setGroupCount={setGroupCount}\n"
                "          layerDecomp={layerDecomp}\n"
                "          setLayerDecomp={setLayerDecomp}\n"
                "          webSearch={webSearch}\n"
                "          setWebSearch={setWebSearch}\n"
                "          fastMode={fastMode}\n"
                "          setFastMode={setFastMode}\n"
                "          outputFormat={outputFormat}\n"
                "          setOutputFormat={setOutputFormat}\n"
                "          transparent={transparent}\n"
                "          setTransparent={setTransparent}\n"
                "          generating={generating}\n"
                "          inputMode={inputMode}\n"
                "          onSubmit={onSubmit}\n"
                "        />\n"
                "        )}"
            )
            new = (
                "        {inputMode === \"video\" ? (\n"
                "          <VideoPromptBar\n"
                "            prompt={videoPrompt}\n"
                "            setPrompt={setVideoPrompt}\n"
                "            content={videoContent}\n"
                "            setContent={setVideoContent}\n"
                "            resolution={videoResolution}\n"
                "            setResolution={setVideoResolution}\n"
                "            duration={videoDuration}\n"
                "            setDuration={setVideoDuration}\n"
                "            ratio={videoRatio}\n"
                "            setRatio={setVideoRatio}\n"
                "            watermark={videoWatermark}\n"
                "            setWatermark={setVideoWatermark}\n"
                "            generating={generating && !!videoTaskId}\n"
                "            onSubmit={onSubmit}\n"
                "            onCancel={onCancelVideo}\n"
                "          />\n"
                "        ) : inputMode !== \"tools\" && (\n"
                "        <PromptBar\n"
                "          prompt={prompt}\n"
                "          setPrompt={setPrompt}\n"
                "          refs={refs}\n"
                "          setRefs={setRefs}\n"
                "          model={model}\n"
                "          setModel={setModel}\n"
                "          size={size}\n"
                "          setSize={setSize}\n"
                "          groupCount={groupCount}\n"
                "          setGroupCount={setGroupCount}\n"
                "          layerDecomp={layerDecomp}\n"
                "          setLayerDecomp={setLayerDecomp}\n"
                "          webSearch={webSearch}\n"
                "          setWebSearch={setWebSearch}\n"
                "          fastMode={fastMode}\n"
                "          setFastMode={setFastMode}\n"
                "          outputFormat={outputFormat}\n"
                "          setOutputFormat={setOutputFormat}\n"
                "          transparent={transparent}\n"
                "          setTransparent={setTransparent}\n"
                "          generating={generating}\n"
                "          inputMode={inputMode}\n"
                "          onSubmit={onSubmit}\n"
                "        />\n"
                "        )}"
            )
            if old in s:
                s = s.replace(old, new)
                print("replaced bottom PromptBar block with conditional VideoPromptBar")
            else:
                print("WARN: old PromptBar block not found")
        else:
            print("VideoPromptBar already rendered, skipping")

    # 8. Add video key warning (similar to image key warning) when in video mode
    if "还没配置视频 API Key" not in s:
        # The existing image key warning is at: {hasKey === false && ( ... )}
        # We'll add a parallel block before the existing one OR after
        # Simpler: add the video key warning as a separate block before the image key warning
        marker = (
            "        {hasKey === false && (\n"
            "          <div\n"
            "            className=\"mb-2 flex items-center gap-2 px-3 py-2 rounded-md border text-xs\""
        )
        new = (
            "        {inputMode === \"video\" && hasVideoKey === false && (\n"
            "          <div\n"
            "            className=\"mb-2 flex items-center gap-2 px-3 py-2 rounded-md border text-xs\"\n"
            "            style={{\n"
            "              backgroundColor:\n"
            "                \"color-mix(in srgb, var(--status-warn) 8%, transparent)\",\n"
            "              borderColor:\n"
            "                \"color-mix(in srgb, var(--status-warn) 28%, transparent)\",\n"
            "            }}\n"
            "          >\n"
            "            <KeyRound\n"
            "              className=\"w-4 h-4 flex-shrink-0\"\n"
            "              style={{ color: \"var(--status-warn)\" }}\n"
            "            />\n"
            "            <span className=\"flex-1 text-text-secondary\">\n"
            "              还没配置视频 API Key。填了才能生视频。\n"
            "            </span>\n"
            "            <button\n"
            "              onClick={onOpenSettings}\n"
            "              className=\"px-2 py-0.5 rounded text-xs font-medium hover:opacity-80\"\n"
            "              style={{\n"
            "                color: \"var(--status-warn)\",\n"
            "                backgroundColor:\n"
            "                  \"color-mix(in srgb, var(--status-warn) 18%, transparent)\",\n"
            "              }}\n"
            "            >\n"
            "              打开设置\n"
            "            </button>\n"
            "          </div>\n"
            "        )}\n"
            "        {hasKey === false && (\n"
            "          <div\n"
            "            className=\"mb-2 flex items-center gap-2 px-3 py-2 rounded-md border text-xs\""
        )
        if marker in s:
            s = s.replace(marker, new, 1)
            print("added video key warning")
        else:
            print("WARN: marker for hasKey block not found, skipping warning add")

    PD.write_text(s, encoding="utf-8")
    print(f"updated {PD}")
    return 0


if __name__ == "__main__":
    import sys
    sys.exit(main())
