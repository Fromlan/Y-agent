import { useCallback, useEffect, useState, useRef } from "react";
import { KeyRound } from "lucide-react";
import { useSession } from "@/lib/session";
import { deleteAsset, backfillLocalAssets } from "@/lib/assets";
import { renameProject } from "@/lib/projects";
import { explainError } from "@/lib/jimeng";
import { hasApiKey } from "@/lib/api-key";
import { useToast } from "@/components/shared/Toast";
import { usePrompt } from "@/components/shared/PromptProvider";
import { confirmDialog } from "@/lib/dialog";
import VideoPromptBar from "@/components/workspace/VideoPromptBar";
import VideoTaskCard, { type VideoTaskTrack } from "@/components/workspace/VideoTaskCard";
import {
  submitVideo,
  validateAndFixParams,
  type ContentItem,
  type VideoRatio,
  type VideoResolution,
} from "@/lib/video";
import {
  optimizeVideoPrompt,
  explainOptimizeReason,
  isHardFailure,
  type OptimizeReason,
} from "@/lib/h3-context-ir";
import { useProjectBootstrap } from "@/lib/hooks/useProjectBootstrap";
import { useVideoTaskBoard } from "@/lib/hooks/useVideoTaskBoard";
import { useChatSubmit } from "@/lib/hooks/useChatSubmit";
import { executePlanStream } from "@/lib/agent-flow";
import {
  clearSession as dbClearSession,
} from "@/lib/chat-history";
import PromptBar from "@/components/workspace/PromptBar";
import AssetBoard from "@/components/workspace/AssetBoard";
import ChatMessageList from "@/components/workspace/ChatMessageList";
import ModeSwitch, { type InputMode } from "@/components/workspace/ModeSwitch";
import ToolsTab from "@/components/workspace/ToolsTab";
import AgentMemoryPanel from "@/components/workspace/AgentMemoryPanel";
import CharacterWorkshop from "@/components/workspace/CharacterWorkshop";
import ProjectHeader from "@/components/workspace/ProjectHeader";
import { loadStyleContract, type StyleContract } from "@/lib/style-contract";
import { log } from "@/lib/logger";

interface Props {
  onBack: () => void;
  onOpenSettings: () => void;
}

type ViewTab = "chat" | "assets" | "tools" | "characters";

export default function ProjectDetail({ onBack, onOpenSettings }: Props) {
  const { currentProject, setCurrentProject } = useSession();
  const toast = useToast();
  const askText = usePrompt();

  // ---------- 项目级数据统一由 useProjectBootstrap 管理 ----------
  const {
    assets,
    setAssets,
    loading,
    agentCtx,
    setAgentCtx,
    chatSessionId,
    messages,
    setMessages,
    hasKey: initialHasKey,
    model,
    setModel,
    size,
    setSize,
    reload,
  } = useProjectBootstrap(currentProject?.id);

  // hasKey 在"生成后"也需要重新检测（用户可能从设置切回来配了 Key）
  const [hasKey, setHasKey] = useState<boolean | null>(initialHasKey);
  useEffect(() => {
    setHasKey(initialHasKey);
  }, [initialHasKey]);

  // 视图 tab：对话 / 资产
  const [tab, setTab] = useState<ViewTab>("chat");

  // M3：当前项目下的角色档案（含 scope=global），PromptBar picker 用
  const [characterArchives, setCharacterArchives] = useState<
    import("@/lib/types").CharacterArchive[]
  >([]);
  const [selectedArchiveId, setSelectedArchiveId] = useState<string | null>(null);
  // M3.6：Workshop 内部"当前正在编辑哪条"的选中态(跟 selectedArchiveId 解耦 —
  // 选中的不一定就是应用到 PromptBar 的)。
  const [selectedArchiveIdInWorkshop, setSelectedArchiveIdInWorkshop] =
    useState<string | null>(null);
  // 切项目时清掉两个选中态
  useEffect(() => {
    setSelectedArchiveIdInWorkshop(null);
  }, [currentProject?.id]);

  // 共享 reload 入口（useEffect + picker 内部新建/删除 都用）
  const [loadingCharacterArchives, setLoadingCharacterArchives] = useState(true);
  const reloadCharacterArchives = useCallback(async () => {
    if (!currentProject) return;
    setLoadingCharacterArchives(true);
    try {
      const { listCharacterArchives } = await import("@/lib/character-archive");
      const rows = await listCharacterArchives(currentProject.id);
      setCharacterArchives(rows);
    } catch {
      setCharacterArchives([]);
    } finally {
      setLoadingCharacterArchives(false);
    }
  }, [currentProject]);

  // 切项目 / 进项目时 reload 角色档案（M3.1 list_character_archives）
  useEffect(() => {
    void reloadCharacterArchives();
  }, [reloadCharacterArchives]);

  // 切项目时清掉选中的档案
  useEffect(() => {
    setSelectedArchiveId(null);
  }, [currentProject?.id]);

  // 共享输入态
  const [prompt, setPrompt] = useState("");
  // M-6: 进项目时从 Skill 中心带回的待注入 Skill(localStorage 接力)
  // 一次性消费,读后立即清,避免下次进项目还残留
  useEffect(() => {
    if (!currentProject) return;
    try {
      const raw = localStorage.getItem("y-agent.pendingSkill");
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed?.id && typeof parsed.id === "string") {
        setPrompt(`/${parsed.id} `);
        setInputMode("chat");
        setTab("chat");
        // focus 输入框
        window.setTimeout(() => {
          const ta = document.querySelector<HTMLTextAreaElement>(
            'textarea[placeholder*="画面"]'
          );
          ta?.focus();
        }, 50);
      }
    } catch {
      // ignore
    } finally {
      try {
        localStorage.removeItem("y-agent.pendingSkill");
      } catch {
        // ignore
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProject?.id]);
  const [refs, setRefs] = useState<string[]>([]);
  const [groupCount, setGroupCount] = useState(1);
  const [layerDecomp, setLayerDecomp] = useState(false);
  const [generating, setGenerating] = useState(false);
  // P0：新增能力位开关
  const [webSearch, setWebSearch] = useState(false);
  const [fastMode, setFastMode] = useState(false);
  const [outputFormat, setOutputFormat] = useState<"" | "png" | "jpeg">("png");
  const [transparent, setTransparent] = useState(false);

  // P8：生视频模式状态（与生图解耦）
  const [videoPrompt, setVideoPrompt] = useState("");
  const [videoContent, setVideoContent] = useState<ContentItem[]>([]);
  const [videoResolution, setVideoResolution] = useState<VideoResolution>("2K");
  const [videoDuration, setVideoDuration] = useState<number>(5);
  const [videoRatio, setVideoRatio] = useState<VideoRatio | "auto">("16:9");
  const [videoWatermark, setVideoWatermark] = useState(false);
  // P9: H3-Context-IR 提示词增强开关。默认 ON,用户在 VideoPromptBar 里改。
  const [optimizePrompt, setOptimizePrompt] = useState(true);
  // 输入模式：生图（M1 直调）/ 对话（Agent 路由）
  const [inputMode, setInputMode] = useState<InputMode>("chat");
  // P10：视频任务板(state / effects / 事件订阅 / CRUD)统一由 useVideoTaskBoard 管
  // ref 给事件回调读最新值（闭包会过期），state 交给 React 渲染。
  const {
    videoTasks,
    hasVideoKey,
    videoTaskFilter,
    setVideoTaskFilter,
    videoSubmitting,
    setVideoSubmitting,
    addVideoTask,
    cancelVideo: hookCancelVideo,
  } = useVideoTaskBoard({
    projectId: currentProject?.id,
    reload,
    toast,
    inputMode,
  });
  // M3：Agent 调 character_use_archive 后存到这里，下一次 jimeng_generate_image 会自动注入 prompt
  // - 用 ref 而非 state：避免 tool handler 内 setState 触发额外 re-render
  // - 用完即清（executePlanStream 内消费后置 null），避免下次生图仍被注入
  const pendingCharacterArchiveRef = useRef<import("@/lib/types").CharacterArchive | null>(null);

  // Agent 记忆面板开关
  const [memoryOpen, setMemoryOpen] = useState(false);

  // P1：项目级风格契约（每次切项目时重新加载）
  const [styleContract, setStyleContract] = useState<StyleContract | null>(null);
  useEffect(() => {
    if (!currentProject) return;
    let cancelled = false;
    loadStyleContract(currentProject.id)
      .then((c) => {
        if (!cancelled) setStyleContract(c);
      })
      .catch((e) => log.warn("style-contract", "load failed", e));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProject?.id]);

  // 风格契约生效时把 checksum 提出来给 agent-flow 用
  const styleContractId = styleContract?.checksum || undefined;

  // 对话流 5 个 callback(state/effects/订阅/CRUD)统一由 useChatSubmit 管
  // (commit 12 抽自 ProjectDetail.tsx,纯结构性切片,不改行为)
  const { onSubmitChat, onConfirmPlan, onCancelPlan } = useChatSubmit({
    prompt,
    setPrompt,
    refs,
    setRefs,
    tab,
    setTab,
    chatSessionId,
    messages,
    setMessages,
    agentCtx,
    setAgentCtx,
    currentProjectId: currentProject?.id ?? "",
    model,
    size,
    groupCount,
    styleContract,
    styleContractId,
    characterArchives,
    setSelectedArchiveId,
    reloadCharacterArchives,
    pendingCharacterArchiveRef,
    generating,
    setGenerating,
    reload,
    toast,
  });

  // 每次切项目 / 每次生成完都重新检测生图 API Key
  // (视频 key 检测走 useVideoTaskBoard 里的 effect)
  useEffect(() => {
    if (!currentProject) return;
    hasApiKey().then(setHasKey).catch(() => setHasKey(false));
  }, [currentProject, generating]);

  // P8：生视频提交（异步任务 + 队列）。override 用于「重试 / 再次提交」复用参数。
  const onSubmitVideo = async (override?: {
    prompt?: string;
    content?: ContentItem[];
    resolution?: VideoResolution;
    duration?: number;
    ratio?: VideoRatio | "auto";
  }) => {
    if (videoSubmitting) return;
    const prompt = (override?.prompt ?? videoPrompt).trim();
    const content = override?.content ?? videoContent;
    const resolution = override?.resolution ?? videoResolution;
    const duration = override?.duration ?? videoDuration;
    const ratio = override?.ratio ?? videoRatio;
    const watermark = videoWatermark;
    if (!prompt) {
      toast.warn("请输入提示词");
      return;
    }
    if (hasVideoKey === false) {
      toast.error("未配置视频 API Key，请到设置里填");
      onOpenSettings();
      return;
    }
    setVideoSubmitting(true);
    try {
      const fixedRatio = ratio === "auto" ? undefined : ratio;
      const originalText = prompt;
      const baseContent: ContentItem[] = content;
      const preCheck = validateAndFixParams({
        model: "MiniMax-H3",
        content: [...baseContent, { type: "text", text: originalText }],
        resolution,
        duration,
        ratio: fixedRatio,
        aigcWatermark: watermark || undefined,
      });
      if (!preCheck.ok) {
        toast.warn(preCheck.reason);
        setVideoSubmitting(false);
        return;
      }

      let finalText = originalText;
      let optimizedPrompt: string | undefined;
      let optimizationReason: OptimizeReason | undefined;
      if (optimizePrompt) {
        toast.info("正在优化提示词…");
        try {
          const h3Content = preCheck.fixed.content;
          const opt = await optimizeVideoPrompt(
            {
              model: "MiniMax-H3",
              content: h3Content,
              duration: preCheck.fixed.duration,
              ratio: preCheck.fixed.ratio,
            },
            originalText
          );
          finalText = opt.prompt;
          if (opt.isOptimized) {
            optimizedPrompt = opt.prompt;
            optimizationReason = opt.reason;
            toast.info("已优化 · 正在生成视频…");
          } else if (isHardFailure(opt.reason)) {
            optimizationReason = opt.reason;
            const why = explainOptimizeReason(opt.reason) ?? opt.reason;
            toast.error(
              `AI 增强失败（${why}）—— 视频仍会用原提示词生成,请检查后重试`
            );
            log.error("project-detail", "h3 hard failure:", opt.reason);
            finalText = originalText;
            optimizedPrompt = undefined;
          } else {
            optimizationReason = opt.reason;
            const why = explainOptimizeReason(opt.reason);
            if (why) toast.warn(`优化跳过（${why}），用原提示词生成`);
          }
        } catch (e: any) {
          log.warn("project-detail", "h3 optimize threw:", e);
          const raw = e?.message ?? String(e);
          if (/API Key/i.test(raw)) {
            toast.error("未配置视频 API Key，请到设置里填");
            onOpenSettings();
            setVideoSubmitting(false);
            return;
          }
          toast.warn("优化调用异常，用原提示词生成");
        }
      }

      const finalContent: ContentItem[] = [
        ...baseContent,
        { type: "text", text: finalText },
      ];
      const check = validateAndFixParams({
        model: "MiniMax-H3",
        content: finalContent,
        resolution,
        duration,
        ratio: fixedRatio,
        aigcWatermark: watermark || undefined,
      });
      if (!check.ok) {
        toast.warn(check.reason);
        setVideoSubmitting(false);
        return;
      }

      const taskId = await submitVideo(
        { ...check.fixed, meta: { optimizedPrompt, originalPrompt: originalText, optimizationReason } },
        currentProject!.id
      );
      addVideoTask({
        taskId,
        status: "queued",
        createdAt: Date.now(),
        prompt: originalText,
        content: baseContent,
        meta: {
          optimizedPrompt,
          originalPrompt: originalText,
          optimizationReason,
        },
        resolution,
        duration,
        ratio: check.fixed.ratio,
      });
      toast.info("视频已提交，异步生成中…");
      if (tab !== "assets") setTab("assets");
      if (!override) setVideoPrompt("");
    } catch (e: any) {
      const raw = e?.message ?? String(e);
      const friendly = await explainError(raw).catch(() => raw);
      toast.error(friendly);
    } finally {
      setVideoSubmitting(false);
    }
  };

  const onCancelVideo = async (taskId: string) => {
    await hookCancelVideo(taskId);
  };

  const onRetryVideo = (task: VideoTaskTrack) => {
    void onSubmitVideo({
      prompt: task.prompt,
      content: task.content,
      resolution: task.resolution,
      duration: task.duration,
      ratio: task.ratio === undefined ? "auto" : task.ratio,
    });
  };

  // 按当前 inputMode 选择实际提交 callback(声明在 onSubmitGenerate 之后)

  // P5+：切项目时主动 backfill 一次，把历史"url 有但 localPath 缺"的资产补下本地。
  // 后端并发下完后通过 `assets://local-backfilled` 事件增量更新到 useProjectBootstrap.assets，
  // 这里 **不再** 调 `reload({ silent: true })`——那样会触发整板 re-render 和重新 IPC。
  // - 启动期 startup_backfill_assets 已经覆盖了"全库补下"路径,
  //   此处只是给"用户切到某老项目时再多跑一次"做保险(冷启动之后某项目被外部改了)。
  useEffect(() => {
    if (!currentProject) return;
    let cancelled = false;
    backfillLocalAssets(currentProject.id)
      .then((r) => {
        if (cancelled) return;
        if (r.brokenMarked > 0) {
          const remaining = r.failed + r.brokenMarked;
          toast.warn(
            `已自动备份 ${r.downloaded} 张图到本地，${remaining} 张图链接已失效（建议重新生成）`
          );
        } else if (r.downloaded > 0) {
          toast.info(`已自动备份 ${r.downloaded} 张历史图到本地`);
        }
      })
      .catch((e) => {
        // 静默失败，不打扰用户（最坏情况就是图片 24h 后过期，与改之前一样）
        console.error("backfill failed:", e);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProject?.id]);


  // 模式与 tab 同步：
  // - 切换项目 → 用当前 inputMode 决定初始 tab
  // - 切换 inputMode → 同步 tab（生图 → 资产，对话 → 对话）
  // 顶部手动 tab 按钮已移除，ModeSwitch 是唯一入口，这里同步 tab 是预期行为。
  const lastSyncedProjectIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!currentProject) return;
    // 切项目时强制同步一次；切 inputMode 时每次都同步
    const isProjectSwitch = lastSyncedProjectIdRef.current !== currentProject.id;
    if (isProjectSwitch) {
      lastSyncedProjectIdRef.current = currentProject.id;
    }
    setTab(
      inputMode === "tools"
        ? "tools"
        : inputMode === "characters"
        ? "characters"
        : inputMode === "generate" || inputMode === "video"
        ? "assets"
        : "chat"
    );
  }, [currentProject, inputMode]);

  if (!currentProject) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-muted">
        未选择项目
      </div>
    );
  }

  const onRename = async () => {
    const name = await askText("新项目名", { defaultValue: currentProject.name });
    if (!name?.trim() || name.trim() === currentProject.name) return;
    try {
      const updated = await renameProject(currentProject.id, name.trim());
      setCurrentProject(updated);
      toast.success("已重命名");
    } catch (e: any) {
      toast.error(`重命名失败：${e?.message ?? e}`);
    }
  };

  const onDeleteAsset = async (id: string) => {
    const ok = await confirmDialog("确认删除这个资产？", { okLabel: "删除" });
    if (!ok) return;
    try {
      await deleteAsset(id);
      setAssets((prev) => prev.filter((a) => a.id !== id));
      toast.success("已删除");
    } catch (e: any) {
      toast.error(`删除失败：${e?.message ?? e}`);
    }
  };

  const onCopyPrompt = (text: string) => {
    navigator.clipboard.writeText(text).then(
      () => toast.success("已复制 prompt"),
      () => toast.error("复制失败")
    );
  };

  const onDownload = (url: string, filename: string) => {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.target = "_blank";
    a.rel = "noreferrer";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // -------------------------------------------------------------------------
  // 生图模式 submit（M1 行为：直接调即梦，资产入库，无 Agent 路由）
  // -------------------------------------------------------------------------
  const onSubmitGenerate = async () => {
    if (generating) return;
    if (!prompt.trim()) {
      toast.warn("请输入提示词");
      return;
    }
    if (model.capabilities.layerDecomposition && layerDecomp && refs.length === 0) {
      toast.warn("图层拆分模式必须先上传一张参考图");
      return;
    }
    if (model.capabilities.layerDecomposition && layerDecomp && groupCount > 1) {
      toast.warn("图层拆分模式只支持单图输出");
      return;
    }
    if (transparent && refs.length === 0) {
      toast.warn("透明背景模式需要至少 1 张带透明通道的输入图");
      return;
    }
    setGenerating(true);
    // P1：流式生图。Lite/4.5/4.0 走 SSE，5.0 Pro 自动 fallback 到非流式。
    let partialCount = 0;
    try {
      await executePlanStream(
        {
          prompt: prompt.trim(),
          modelId: model.id,
          modelName: model.name,
          size,
          images: refs.length > 0 ? refs : undefined,
          maxImages: groupCount > 1 ? groupCount : undefined,
          layerDecomposition: model.capabilities.layerDecomposition && layerDecomp ? true : undefined,
          outputFormat: outputFormat || undefined,
          tools: webSearch ? ["web_search"] : undefined,
          optimizePromptMode: fastMode ? "fast" : undefined,
          background: transparent ? "transparent" : undefined,
          // P1：项目级风格契约短哈希（直接"Generate"按钮路径无 skill 上下文）
          ...(styleContractId ? { styleContractId } : {}),
        },
        currentProject.id,
        {
          onPartialAsset: () => {
            partialCount++;
            toast.info(`已就绪 ${partialCount} / ${groupCount}`);
          },
          onPartialFailed: (info) => {
            toast.warn(`第 ${(info.index ?? -1) + 1} 张生成失败：${info.message ?? info.code ?? "未知"}`);
          },
        }
      );
      // 走完（executePlanStream resolve 等于 onCompleted）
      await reload({ silent: true });
      toast.success(
        partialCount > 1
          ? `已入库到资产库（${partialCount} 张）`
          : "已入库到资产库"
      );
      setPrompt("");
      setRefs([]);
    } catch (e: any) {
      const raw = e?.message ?? String(e);
      const friendly = await explainError(raw).catch(() => raw);
      toast.error(friendly);
      // 流式中断时也要 reload（已 partial 入库的图要显示）
      if (partialCount > 0) {
        await reload({ silent: true });
      }
    } finally {
      setGenerating(false);
    }
  };

  // 按当前 inputMode 选择实际提交 callback
  const onSubmit = inputMode === "chat" ? onSubmitChat : inputMode === "video" ? onSubmitVideo : onSubmitGenerate;

  // -------------------------------------------------------------------------
  /** 清空所有对话历史 */
  const onClearHistory = async () => {
    if (!chatSessionId) return;
    const ok = await confirmDialog(
      "确认清空所有对话历史？\n\n项目内的资产不会被删除（它们在「资产」tab 里）。",
      { okLabel: "清空" }
    );
    if (!ok) return;
    try {
      await dbClearSession(chatSessionId);
      setMessages([]);
      toast.success("对话历史已清空");
    } catch (e: any) {
      toast.error(`清空失败：${e?.message ?? e}`);
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <ProjectHeader
        projectName={currentProject.name}
        assetCount={assets.length}
        onBack={onBack}
        onRename={onRename}
        onOpenMemory={() => setMemoryOpen(true)}
        onClearHistory={onClearHistory}
      />

      {/* 主区 */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {tab === "chat" ? (
          <ChatMessageList
            messages={messages}
            generating={generating}
            onConfirmPlan={onConfirmPlan}
            onCancelPlan={onCancelPlan}
            // P7：让 PlanCard 展示"将使用 X 模型"
            currentModelName={model.name}
            // M-8: 示范 prompt 卡片 → 写入输入框
            onPickDemoPrompt={(text) => {
              setPrompt(text);
              setTimeout(() => {
                const ta = document.querySelector<HTMLTextAreaElement>(
                  'textarea[placeholder*="画面"]'
                );
                ta?.focus();
              }, 50);
            }}
          />
        ) : tab === "tools" ? (
          <ToolsTab
            projectId={currentProject.id}
            assets={assets}
            hasKey={hasKey}
            onOpenSettings={onOpenSettings}
            onAssetCreated={() => {
              // 工具生成完后 reload，让 AssetBoard 拿到新资产
              reload({ silent: true });
            }}
          />
        ) : tab === "characters" ? (
          <CharacterWorkshop
            projectId={currentProject.id}
            assets={assets}
            archives={characterArchives}
            loading={loadingCharacterArchives}
            onReload={() => reloadCharacterArchives()}
            selectedId={selectedArchiveIdInWorkshop}
            onSelectedIdChange={setSelectedArchiveIdInWorkshop}
            onApplyToPromptBar={(id, opts) => {
              // M3.2.4 + O-6: 角色工坊"应用"按钮真正接到 PromptBar
              // - 写 selectedArchiveId 让 CharacterArchivePicker 同步高亮
              // - 切到 chat tab + chat 输入模式让用户立刻能 prompt
              // - O-6: focus=true 时 setTimeout focus 输入框,1 步到位
              if (id) {
                setSelectedArchiveId(id);
                setInputMode("chat");
                setTab("chat");
                const archive = characterArchives.find((a) => a.id === id);
                toast.success(
                  archive
                    ? `已应用「${archive.name}」到 PromptBar${
                        opts?.focus ? "（开始打字吧）" : ""
                      }`
                    : `已应用档案到 PromptBar`,
                );
                if (opts?.focus) {
                  // 等切到 chat + ChatMessageList 渲染后,再 focus 输入框
                  window.setTimeout(() => {
                    const ta = document.querySelector<HTMLTextAreaElement>(
                      'textarea[placeholder*="画面"]',
                    );
                    ta?.focus();
                  }, 50);
                }
              } else {
                setSelectedArchiveId(null);
                toast.info("已清除档案选择");
              }
            }}
          />
        ) : (
          <div className="flex-1 overflow-y-auto">
            <div className="p-4">
              {inputMode === "video" && Object.keys(videoTasks).length > 0 && (
                <div className="mb-4 space-y-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-medium text-text-muted">视频任务</span>
                    {(
                      [
                        ["active", "进行中"],
                        ["failed", "失败"],
                        ["all", "全部"],
                      ] as const
                    ).map(([key, label]) => {
                      const n =
                        key === "active"
                          ? Object.values(videoTasks).filter(
                              (t) => t.status === "queued" || t.status === "running"
                            ).length
                          : key === "failed"
                          ? Object.values(videoTasks).filter((t) => t.status === "failed").length
                          : Object.keys(videoTasks).length;
                      const on = videoTaskFilter === key;
                      return (
                        <button
                          key={key}
                          onClick={() => setVideoTaskFilter(key)}
                          className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors
                            ${on
                              ? "border-accent text-accent bg-accent/10"
                              : "border-border text-text-secondary hover:border-border-strong"}`}
                        >
                          {label}
                          <span className="ml-1 text-[10px] opacity-60">{n}</span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="space-y-3">
                    {Object.values(videoTasks)
                      .sort((a, b) => b.createdAt - a.createdAt)
                      .filter((t) =>
                        videoTaskFilter === "active"
                          ? t.status === "queued" || t.status === "running"
                          : videoTaskFilter === "failed"
                          ? t.status === "failed"
                          : true
                      )
                      .map((t) => (
                        <VideoTaskCard
                          key={t.taskId}
                          task={t}
                          onCancel={onCancelVideo}
                          onRetry={onRetryVideo}
                        />
                      ))}
                  </div>
                </div>
              )}
              {loading ? (
                <p className="text-text-secondary text-sm text-center mt-12">加载中...</p>
              ) : (
                <AssetBoard
                  assets={assets}
                  onCopyPrompt={onCopyPrompt}
                  onDownload={onDownload}
                  onDelete={onDeleteAsset}
                  onBatchDelete={async (ids) => {
                    const deleted: string[] = [];
                    try {
                      for (const id of ids) {
                        await deleteAsset(id);
                        deleted.push(id);
                      }
                    } finally {
                      if (deleted.length > 0) {
                        setAssets((prev) => prev.filter((a) => !deleted.includes(a.id)));
                      }
                    }
                  }}
                  onAssetCreated={() => {
                    // P3：局部编辑后入库的资产走 reload（保持排序与筛选一致）
                    reload({ silent: true });
                  }}
                />
              )}
            </div>
          </div>
        )}
      </div>

      {/* 底部统一输入区 */}
      <div className="border-t border-border bg-bg-panel p-4 flex-shrink-0">
        {inputMode === "video" && hasVideoKey === false && (
          <div
            className="mb-2 flex items-center gap-2 px-3 py-2 rounded-md border text-xs"
            style={{
              backgroundColor:
                "color-mix(in srgb, var(--status-warn) 8%, transparent)",
              borderColor:
                "color-mix(in srgb, var(--status-warn) 28%, transparent)",
            }}
          >
            <KeyRound
              className="w-4 h-4 flex-shrink-0"
              style={{ color: "var(--status-warn)" }}
            />
            <span className="flex-1 text-text-secondary">
              还没配置视频 API Key。填了才能生视频。
            </span>
            <button
              onClick={onOpenSettings}
              className="px-2 py-0.5 rounded text-xs font-medium hover:opacity-80"
              style={{
                color: "var(--status-warn)",
                backgroundColor:
                  "color-mix(in srgb, var(--status-warn) 18%, transparent)",
              }}
            >
              打开设置
            </button>
          </div>
        )}
        {hasKey === false && (
          <div
            className="mb-2 flex items-center gap-2 px-3 py-2 rounded-md border text-xs"
            style={{
              backgroundColor:
                "color-mix(in srgb, var(--status-warn) 8%, transparent)",
              borderColor:
                "color-mix(in srgb, var(--status-warn) 28%, transparent)",
            }}
          >
            <KeyRound
              className="w-4 h-4 flex-shrink-0"
              style={{ color: "var(--status-warn)" }}
            />
            <span className="flex-1 text-text-secondary">
              还没配置即梦 API Key。填了才能生成图。
            </span>
            <button
              onClick={onOpenSettings}
              className="px-2 py-0.5 rounded text-xs font-medium hover:opacity-80"
              style={{
                color: "var(--status-warn)",
                backgroundColor:
                  "color-mix(in srgb, var(--status-warn) 18%, transparent)",
              }}
            >
              打开设置
            </button>
          </div>
        )}
        <div className="flex items-center gap-2 mb-3">
          <ModeSwitch mode={inputMode} onChange={setInputMode} disabled={generating} />
        </div>
        {inputMode === "video" ? (
          <VideoPromptBar
            prompt={videoPrompt}
            setPrompt={setVideoPrompt}
            content={videoContent}
            setContent={setVideoContent}
            resolution={videoResolution}
            setResolution={setVideoResolution}
            duration={videoDuration}
            setDuration={setVideoDuration}
            ratio={videoRatio}
            setRatio={setVideoRatio}
            watermark={videoWatermark}
            setWatermark={setVideoWatermark}
            optimizePrompt={optimizePrompt}
            setOptimizePrompt={setOptimizePrompt}
            generating={videoSubmitting}
            onSubmit={onSubmit}
          />
        ) : inputMode !== "tools" && (
        <PromptBar
          prompt={prompt}
          setPrompt={setPrompt}
          refs={refs}
          setRefs={setRefs}
          model={model}
          setModel={setModel}
          size={size}
          setSize={setSize}
          groupCount={groupCount}
          setGroupCount={setGroupCount}
          layerDecomp={layerDecomp}
          setLayerDecomp={setLayerDecomp}
          webSearch={webSearch}
          setWebSearch={setWebSearch}
          fastMode={fastMode}
          setFastMode={setFastMode}
          outputFormat={outputFormat}
          setOutputFormat={setOutputFormat}
          transparent={transparent}
          setTransparent={setTransparent}
          generating={generating}
          inputMode={inputMode}
          projectId={currentProject.id}
          archives={characterArchives}
          selectedArchiveId={selectedArchiveId}
          setSelectedArchiveId={setSelectedArchiveId}
          onOpenCharacterWorkshop={() => {
            setInputMode("characters");
            setTab("characters");
          }}
          onArchivesChanged={() => void reloadCharacterArchives()}
          onSubmit={onSubmit}
        />
        )}
      </div>

      <AgentMemoryPanel
        open={memoryOpen}
        onClose={() => setMemoryOpen(false)}
        projectId={currentProject.id}
        onContextChange={setAgentCtx}
        onStyleContractChange={setStyleContract}
      />
    </div>
  );
}
