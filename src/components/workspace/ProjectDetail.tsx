import { useEffect, useState, useRef } from "react";
import { ArrowLeft, Brain, KeyRound, Trash2 } from "lucide-react";
import { useSession } from "@/lib/session";
import { deleteAsset, backfillLocalAssets, createAsset } from "@/lib/assets";
import { buildAssetPayload } from "@/lib/asset-payload";
import { renameProject } from "@/lib/projects";
import { explainError } from "@/lib/jimeng";
import { hasApiKey } from "@/lib/api-key";
import { useToast } from "@/components/shared/Toast";
import { usePrompt } from "@/components/shared/PromptProvider";
import { confirmDialog } from "@/lib/dialog";
import VideoPromptBar from "@/components/workspace/VideoPromptBar";
import {
  submitVideo,
  cancelVideo,
  hasVideoApiKey,
  subscribeVideoEvents,
  validateAndFixParams,
  type ContentItem,
  type VideoRatio,
  type VideoResolution,
} from "@/lib/video";
import { useProjectBootstrap } from "@/lib/hooks/useProjectBootstrap";
import { MODEL_OPTIONS, type Asset, type ModelOption } from "@/lib/types";
import {
  clearSession as dbClearSession,
  assetIds as dbAssetIds,
  persistInsert,
  persistUpdate,
  persistDelete,
} from "@/lib/chat-history";
import PromptBar from "@/components/workspace/PromptBar";
import AssetBoard from "@/components/workspace/AssetBoard";
import ChatMessageList from "@/components/workspace/ChatMessageList";
import ModeSwitch, { type InputMode } from "@/components/workspace/ModeSwitch";
import ToolsTab from "@/components/workspace/ToolsTab";
import AgentMemoryPanel from "@/components/workspace/AgentMemoryPanel";
import { agentEvents, type ChatMessage, type AgentEvent, type ToolCallRecord } from "@/lib/agent-event";
import { route } from "@/lib/agent-router";
import { loadLlmConfig } from "@/lib/llm-config";
import { llmChatLoop, type LLMConfig, type ChatMessage as LLMChatMessage } from "@/lib/llm";
import { AGENT_TOOLS, renderSystemPrompt } from "@/lib/agent-tools";
import { executePlanStream, learnFromGeneration } from "@/lib/agent-flow";
import { loadStyleContract, type StyleContract } from "@/lib/style-contract";
import { log } from "@/lib/logger";

interface Props {
  onBack: () => void;
  onOpenSettings: () => void;
}

type ViewTab = "chat" | "assets" | "tools";

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

  // 共享输入态
  const [prompt, setPrompt] = useState("");
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
  const [hasVideoKey, setHasVideoKey] = useState<boolean | null>(null);
  const [videoTaskId, setVideoTaskId] = useState<string | null>(null);

  // 输入模式：生图（M1 直调）/ 对话（Agent 路由）
  const [inputMode, setInputMode] = useState<InputMode>("chat");

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

  // 每次切项目 / 每次生成完都重新检测 API Key
  useEffect(() => {
    if (!currentProject) return;
    hasApiKey().then(setHasKey).catch(() => setHasKey(false));
    hasVideoApiKey().then(setHasVideoKey).catch(() => setHasVideoKey(false));
  }, [currentProject, generating]);

  // P8：切到生视频模式时检查 video key
  useEffect(() => {
    if (inputMode === "video") {
      hasVideoApiKey().then(setHasVideoKey).catch(() => setHasVideoKey(false));
    }
  }, [inputMode]);

  // P8：订阅视频事件（progress / succeeded / failed / cancelled）
  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | null = null;
    const t0 = Date.now();
    subscribeVideoEvents({
      onProgress: ({ taskId, status }) => {
        if (taskId !== videoTaskId) return;
        const sec = Math.round((Date.now() - t0) / 1000);
        toast.info(`视频生成中… ${sec}s（${status}）`);
      },
      onSucceeded: async ({ taskId, url, localPath, resolution, duration, ratio }) => {
        if (taskId !== videoTaskId) return;
        if (!currentProject) return;
        try {
          const t1 = Date.now();
          await createAsset({
            projectId: currentProject!.id,
            prompt: videoPrompt.trim(),
            model: "MiniMax-H3",
            modelName: "MiniMax H3 (视频)",
            size: resolution || videoResolution,
            refCount: videoContent.filter(
              (c) =>
                c.type === "image_url" ||
                c.type === "video_url" ||
                c.type === "audio_url"
            ).length,
            costMs: Date.now() - t1,
            isLayerDecomposition: false,
            payload: buildAssetPayload(
              {
                urls: [],
                isTransparent: false,
                kind: "video",
                video: {
                  url,
                  localPath,
                  duration: duration || videoDuration,
                  ratio: ratio || videoRatio,
                  resolution: (resolution || videoResolution) as "768P" | "2K",
                  taskId,
                },
                status: "approved",
              },
              undefined
            ),
          });
          await reload({ silent: true });
          toast.success("视频已生成，已入库到资产库");
        } catch (e: any) {
          const raw = e?.message ?? String(e);
          const friendly = await explainError(raw).catch(() => raw);
          toast.error(`视频入库失败：${friendly}`);
        } finally {
          setVideoTaskId(null);
          setGenerating(false);
        }
      },
      onFailed: async ({ taskId, code, message }) => {
        if (taskId !== videoTaskId) return;
        const raw = `${code ? `(${code}) ` : ""}${message}`;
        const friendly = await explainError(raw).catch(() => raw);
        toast.error(`视频生成失败：${friendly}`);
        setVideoTaskId(null);
          setGenerating(false);
      },
      onCancelled: ({ taskId }) => {
        if (taskId !== videoTaskId) return;
        toast.info("视频生成已取消");
        setVideoTaskId(null);
        setGenerating(false);
      },
    })
      .then((u) => {
        if (cancelled) u();
        else unlisten = u;
      })
      .catch((e) => console.error("subscribeVideoEvents failed", e));
    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, [videoTaskId, currentProject, videoPrompt, videoContent, videoResolution, videoDuration, videoRatio, toast, reload]);


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
    if (model.supportsLayerDecomposition && layerDecomp && refs.length === 0) {
      toast.warn("图层拆分模式必须先上传一张参考图");
      return;
    }
    if (model.supportsLayerDecomposition && layerDecomp && groupCount > 1) {
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
          layerDecomposition: model.supportsLayerDecomposition && layerDecomp ? true : undefined,
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

  // -------------------------------------------------------------------------
  // 对话模式 submit：优先走 LLM 真对话；未配 LLM 时降级到规则 + 计划确认
  // -------------------------------------------------------------------------
  const onSubmitChat = async () => {
    if (generating) return;
    if (!prompt.trim()) {
      toast.warn("请输入提示词");
      return;
    }
    if (!chatSessionId) {
      toast.error("对话会话未就绪，请重试");
      return;
    }
    const text = prompt.trim();
    setPrompt("");
    if (tab !== "chat") setTab("chat");

    // 用户消息入流 + 入库
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      attachments: refs.length > 0 ? [...refs] : undefined,
      createdAt: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    persistInsert(chatSessionId, {
      id: userMsg.id,
      role: "user",
      content: text,
      attachments: refs.length > 0 ? [...refs] : undefined,
    });

    setGenerating(true);
    const events: AgentEvent[] = [];
    const off = agentEvents.on((e) => {
      events.push(e);
    });

    const llmCfg = await loadLlmConfig().catch(() => null);

    try {
      agentEvents.emit({ type: "turn_start", userInput: text });

      if (llmCfg && llmCfg.apiKey) {
        // === LLM 路径：真对话，Agent 主动反问/调工具 ===
        await runLlmTurn(text, llmCfg, events, off);
      } else {
        // === 降级：规则路由 + 计划确认（不自动生图） ===
        await runRulePlan(text, events, off);
      }
    } catch (e: any) {
      const raw = e?.message ?? String(e);
      const friendly = await explainError(raw).catch(() => raw);
      const errorMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "agent",
        content: "",
        events: [...events],
        error: friendly,
        createdAt: Date.now(),
      };
      setMessages((prev) => [...prev, errorMsg]);
      // error 消息不入库（不持久化错误现场）
    } finally {
      off();
      setRefs([]);
      setGenerating(false);
    }
  };

  /** LLM 路径：把当前 messages + system prompt + tools 给 LLM，循环直到没有 tool_call */
  const runLlmTurn = async (
    userInput: string,
    cfg: LLMConfig,
    events: AgentEvent[],
    _off: () => void
  ) => {
    const agentId = crypto.randomUUID();
    // 占位 agent 消息：pending=true 等 LLM 首次返回，streaming=true 时文字逐字追加
    setMessages((prev) => [
      ...prev,
      {
        id: agentId,
        role: "agent",
        content: "",
        events: [...events],
        createdAt: Date.now(),
        pending: true,
        streaming: false,
        toolCalls: [],
      },
    ]);
    // 立即插入空消息占位（content=""），后面再 update
    persistInsert(chatSessionId!, {
      id: agentId,
      role: "agent",
      content: "",
      events: [...events],
    });
    const start = Date.now();

    // 构造 LLM 消息历史：system + 现有 user/agent（不含 tool_calls 等私有字段）
    // - 跳过完全空的 agent 消息（content 空 + 没 tool_calls），避免被 API 报 400。
    // - 用户的 attachments（本地参考图）转成 OpenAI 多模态 images 字段。
    const llmHistory: LLMChatMessage[] = [
      {
        role: "system",
        content: renderSystemPrompt({
          styleHints: agentCtx?.styleHints,
          recentModels: agentCtx?.recentModels,
          // P7：把 PromptBar 选定的模型注入 system prompt，作为 LLM 默认生图模型的强偏好
          userModelName: model.name,
        }),
      },
      ...messages
        .filter((m) => {
          if (m.role === "user") return !!m.content?.trim();
          if (m.role === "agent") {
            // agent 没有 content 但有 tool_calls 的情况当前前端不会持久化 tool_calls，
            // 但保险起见，content 空且无 tool_calls 视为「还没填充」就跳过
            return !!m.content?.trim();
          }
          return false;
        })
        .map((m): LLMChatMessage => ({
          role: m.role === "user" ? "user" : "assistant",
          content: m.content,
          images: m.attachments,
        })),
      { role: "user", content: userInput, images: refs.length > 0 ? [...refs] : undefined },
    ];

    const toolAssets: Asset[] = [];
    let lastModel = model.id;
    let isDemo = false;
    let finalContent = "";

    // 流式回调：实时把 LLM 文字 / 工具状态推给 React state
    let saveTimer: number | null = null;
    const updateAgent = (updater: (m: ChatMessage) => ChatMessage) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === agentId ? updater(m) : m))
      );
      // 流式期间防抖写 DB（每 800ms 一次）
      if (saveTimer === null) {
        saveTimer = window.setTimeout(() => {
          saveTimer = null;
          setMessages((prev) => {
            const cur = prev.find((m) => m.id === agentId);
            if (cur) {
              persistUpdate(agentId, {
                content: cur.content,
                events: [...events, ...(cur.events ?? [])].slice(-200),
              });
            }
            return prev;
          });
        }, 800);
      }
    };
    const appendDelta = (delta: string) => {
      agentEvents.emit({ type: "text_delta", delta });
      updateAgent((m) => ({
        ...m,
        pending: false,
        streaming: true,
        content: m.content + delta,
      }));
    };
    const appendToolCall = (tc: ToolCallRecord) => {
      agentEvents.emit({ type: "tool_start", toolName: tc.toolName, args: tc.args });
      updateAgent((m) => ({
        ...m,
        toolCalls: [...(m.toolCalls ?? []), tc],
      }));
    };
    const updateToolCall = (id: string, patch: Partial<ToolCallRecord>) => {
      updateAgent((m) => ({
        ...m,
        toolCalls: (m.toolCalls ?? []).map((tc) =>
          tc.id === id ? { ...tc, ...patch } : tc
        ),
      }));
    };

    try {
      const { finalContent: loopContent } = await llmChatLoop(
        cfg,
        llmHistory,
        AGENT_TOOLS,
        async (name, args) => {
          if (name === "jimeng_generate_image") {
            const prompt = String(args.prompt ?? "").trim();
            if (!prompt) {
              return { result: "错误：prompt 不能为空" };
            }
            // P7：模型选择以 PromptBar 为准。LLM 传 model 是受控 hint（系统 prompt 已说明：
            // 显式要求切换时才传），所以保留 args.model 覆盖；没传就 fallback 到 PromptBar。
            const useModel = String(args.model ?? model.id);
            const useSize = String(args.size ?? size);
            const refRequired = !!args.ref_required;
            lastModel = useModel;
            const useModelOpt = MODEL_OPTIONS.find((m) => m.id === useModel) ?? model;
            // 用模型能力矩阵而不是写死 4：Lite/4.x 可到 15，Pro 不支持组图。
            let maxImages = Math.max(
              1,
              Math.min(useModelOpt.capabilities.maxGroupImages, Number(args.max_images) || 1)
            );
            // P7：能力位预检——若当前模型不支持 maxImages>1 igroupGeneration，主动降级到 1
            // 并给用户一个 toast 提示；不静默篡改 LLM 决策
            if (maxImages > 1 && !useModelOpt.capabilities.groupGeneration) {
              toast.warn(
                `${useModelOpt.name} 不支持 N 张组图，已自动改为 1 张。要生成 ${maxImages} 张变体请先在 PromptBar 切到 5.0 Lite。`
              );
              maxImages = 1;
            }

            if (refRequired && refs.length === 0) {
              return { result: "用户当前没有提供参考图。请先向用户说明需要参考图，或改用不依赖参考图的方案。" };
            }

            const tcId = crypto.randomUUID();
            appendToolCall({
              id: tcId,
              toolName: "jimeng.generate_image",
              args: { prompt, size: useSize, refRequired, maxImages },
              status: "running",
            });
            // P7：对话模式改走 executePlanStream（流式）。5.0 Pro 自动 fallback 到非流式。
            // - partial 回调：用户能看到"已就绪 N/M"
            // - onCompleted 后拿到主资产（含最终 costMs / isDemo）
            try {
              const streamPlan: Parameters<typeof executePlanStream>[0] = {
                prompt,
                modelId: useModel,
                modelName: useModelOpt.name,
                size: useSize,
                images: refs.length > 0 ? refs : undefined,
              };
              if (maxImages > 1) streamPlan.maxImages = maxImages;
              // P1：项目级风格契约短哈希（LLM 工具调用路径也透传）
              if (styleContractId) streamPlan.styleContractId = styleContractId;
              const result = await executePlanStream(
                streamPlan,
                currentProject.id,
                {
                  onPartialAsset: (asset) => {
                    // partial 资产已经由 executePlanStream 内部入库；这里只 push 到 toolAssets
                    // 让 chat 消息也展示这张图（避免在 chat 流里漏图）。
                    toolAssets.push(asset);
                  },
                  onPartialFailed: (info) => {
                    // 单张失败也展示给用户，不让 LLM 误以为全部成功
                    appendToolCall({
                      id: crypto.randomUUID(),
                      toolName: "jimeng.generate_image.partial_failed",
                      args: { index: info.index, code: info.code, message: info.message },
                      status: "failed",
                      result: `第 ${(info.index ?? -1) + 1} 张生成失败：${info.message ?? info.code ?? "未知"}`,
                    });
                  },
                }
              );
              isDemo = result.isDemo;
              // 主资产已在 stream 完成时入库；如果 plan.maxImages == 1 的话它和 partial[0] 是同一张；
              // 已经 push 过的话不要再 push 避免重复。
              const alreadyPushed = toolAssets.some((a) => a.id === result.asset.id);
              if (!alreadyPushed) toolAssets.push(result.asset);
              const imgs = result.asset.payload.urls.map((u) => ({ url: u }));
              updateToolCall(tcId, {
                status: "done",
                costMs: result.costMs,
                isDemo: result.isDemo,
                assets: [result.asset],
                result: `已生成 ${imgs.length} 张图（${useModelOpt.name}，${(result.costMs / 1000).toFixed(1)}s）`,
              });
              agentEvents.emit({
                type: "tool_end",
                toolName: "jimeng.generate_image",
                costMs: result.costMs,
                assets: [result.asset],
                isDemo: result.isDemo,
              });
              return {
                result: `已生成 ${imgs.length} 张图（模型 ${useModelOpt.name}，尺寸 ${useSize}，${(result.costMs / 1000).toFixed(1)}s）`,
              };
            } catch (e: any) {
              const raw = e?.message ?? String(e);
              const friendly = await explainError(raw).catch(() => raw);
              updateToolCall(tcId, { status: "failed", result: friendly });
              return { result: `生成失败：${friendly}` };
            }
          }
          return { result: `未知工具：${name}` };
        },
        {
          onDelta: appendDelta,
          onTextDone: () => {
            agentEvents.emit({ type: "text_done", fullText: "" });
            updateAgent((m) => ({ ...m, streaming: false }));
          },
          onToolStart: (name, args) => {
            // 已在 appendToolCall 里 emit；这里留作 debug
            log.debug("llm", "tool start:", name, args);
          },
          onToolEnd: (name, assets) => {
            // 已在 updateToolCall 里 emit
            log.debug("llm", "tool end:", name, assets.length);
          },
          onToolError: (name, err) => {
            log.warn("llm", "tool error:", name, err);
          },
        }
      );
      finalContent = loopContent;
      if (!finalContent.trim()) finalContent = "已完成。";
    } catch (e: any) {
      const raw = e?.message ?? String(e);
      const friendly = await explainError(raw).catch(() => raw);
      console.error("LLM turn failed:", e);
      // 把占位消息改成错误消息，避免留下空白 agent 消息。
      setMessages((prev) =>
        prev.map((m) =>
          m.id === agentId
            ? {
                ...m,
                content: "",
                error: friendly,
                events: [...events],
                assets: toolAssets.length > 0 ? toolAssets : undefined,
                streaming: false,
                pending: false,
              }
            : m
        )
      );
      persistUpdate(agentId, {
        content: "",
        error: friendly,
        events: [...events],
        assetIds: toolAssets.length > 0 ? dbAssetIds(toolAssets) : null,
      });
      return;
    }

    const totalCost = Date.now() - start;
    const skillLog = {
      matchedSkill: `LLM (${cfg.provider} · ${cfg.model})`,
      triggerType: "explicit" as const,
      reasoning: "由 LLM 主动调度工具生成",
      modelUsed: lastModel,
      modelName: MODEL_OPTIONS.find((m) => m.id === lastModel)?.name ?? lastModel,
      costMs: totalCost,
      isDemo,
    };
    agentEvents.emit({
      type: "skill_matched",
      skillName: cfg.provider,
      trigger: "explicit",
    });
    agentEvents.emit({
      type: "turn_end",
      assistantMessage: { id: agentId, role: "agent", content: finalContent, createdAt: Date.now() },
    });
    setMessages((prev) =>
      prev.map((m) =>
        m.id === agentId
          ? {
              ...m,
              content: finalContent,
              events: [...events],
              skillLog,
              assets: toolAssets.length > 0 ? toolAssets : undefined,
              streaming: false,
              pending: false,
            }
          : m
      )
    );
    // 把最终内容写回 DB
    persistUpdate(agentId, {
      content: finalContent,
      events: [...events],
      skillLog,
      assetIds: toolAssets.length > 0 ? dbAssetIds(toolAssets) : null,
    });

    // 自动学习
    if (agentCtx) {
      await learnFromGeneration(agentCtx, userInput, lastModel, currentProject.id, setAgentCtx);
    }
    reload({ silent: true });
  };

  /** 规则降级：展示计划，等用户点确认才生图 */
  const runRulePlan = async (
    userInput: string,
    events: AgentEvent[],
    _off: () => void
  ) => {
    const decision = route(
      userInput,
      model,
      agentCtx?.styleHints ?? [],
      styleContract && styleContract.checksum ? styleContract : undefined
    );
    agentEvents.emit({
      type: "skill_matched",
      skillName: decision.skillName ?? "(default)",
      trigger: decision.triggerType,
    });
    agentEvents.emit({ type: "turn_end", assistantMessage: { id: "", role: "agent", content: "", createdAt: Date.now() } });

    const agentId = crypto.randomUUID();
    const planGroupCount = decision.groupCount ?? groupCount;
    // P7：plan 不再存 modelId/modelName（避免和 PromptBar 双源），执行时统一读 model state。
    // 兼容老数据：onConfirmPlan 里如果 plan.modelId 存在仍能用（fallback）。
    const plan: {
      prompt: string;
      size: string;
      image?: string[];
      maxImages?: number;
      suggestedModelName?: string;
      // P0：命中的 Skill id（写入资产 payload，便于按 Skill 维度筛选/统计）
      sourceSkillId?: string;
      // P1：项目级风格契约短哈希（写入资产 payload）
      styleContractId?: string;
    } = {
      prompt: decision.prompt,
      size: decision.size ?? size,
      image: refs.length > 0 ? [...refs] : undefined,
      maxImages: planGroupCount > 1 ? planGroupCount : undefined,
    };
    if (decision.suggestedModelName) {
      plan.suggestedModelName = decision.suggestedModelName;
    }
    if (decision.skill?.id) {
      plan.sourceSkillId = decision.skill.id;
    }
    if (styleContractId) {
      plan.styleContractId = styleContractId;
    }
    const skillLog = {
      matchedSkill: decision.skillName,
      triggerType: decision.triggerType,
      reasoning: decision.reasoning,
      modelUsed: decision.model.id,
      modelName: decision.model.name,
      costMs: 0,
      isDemo: false,
    };
    // 文案更短 + 加引导：把"去配置 LLM"做成可点击的"打开设置"按钮
    // P1 改进 7：原版整条都塞同一段长句，现在拆成"短结论" + "PlanCard 内的提示"
    const content = "已规划好生成计划，点下方「开始生成」即可。\n（未配置 Agent LLM，规则路由模式。）";
    setMessages((prev) => [
      ...prev,
      {
        id: agentId,
        role: "agent",
        content,
        events: [...events],
        skillLog,
        createdAt: Date.now(),
        pendingPlan: plan,
      } as ChatMessage & { pendingPlan?: typeof plan },
    ]);
    // 持久化（plan 信息也存）
    persistInsert(chatSessionId!, {
      id: agentId,
      role: "agent",
      content,
      events: [...events],
      skillLog,
      pendingPlan: plan,
    });
  };

  // P8：生视频提交（异步任务模式）
  const onSubmitVideo = async () => {
    if (generating) return;
    if (!videoPrompt.trim()) {
      toast.warn("请输入提示词");
      return;
    }
    if (hasVideoKey === false) {
      toast.error("未配置视频 API Key，请到设置里填");
      onOpenSettings();
      return;
    }
    // v1：单项目同时只允许 1 个视频任务
    if (videoTaskId) {
      toast.warn("上一个视频还没生成完");
      return;
    }
    setGenerating(true);
    try {
      const fixedRatio = videoRatio === "auto" ? undefined : videoRatio;
      const finalContent: ContentItem[] = [
        ...videoContent,
        { type: "text", text: videoPrompt.trim() },
      ];
      const check = validateAndFixParams({
        model: "MiniMax-H3",
        content: finalContent,
        resolution: videoResolution,
        duration: videoDuration,
        ratio: fixedRatio,
        aigcWatermark: videoWatermark || undefined,
      });
      if (!check.ok) {
        toast.warn(check.reason);
        setGenerating(false);
        return;
      }
      const taskId = await submitVideo(check.fixed, currentProject.id);
      setVideoTaskId(taskId);
      toast.info("视频已提交，异步生成中…");
      // 切到 assets tab 让用户看到结果
      if (tab !== "assets") setTab("assets");
      // 清空 prompt（保留素材，让用户能快速重试微调）
      setVideoPrompt("");
    } catch (e: any) {
      const raw = e?.message ?? String(e);
      const friendly = await explainError(raw).catch(() => raw);
      toast.error(friendly);
      setGenerating(false);
    }
  };

  const onCancelVideo = async () => {
    if (!videoTaskId) return;
    try {
      await cancelVideo(videoTaskId);
    } catch (e: any) {
      console.warn("cancelVideo failed", e);
    }
  };

  const onSubmit = inputMode === "chat" ? onSubmitChat : inputMode === "video" ? onSubmitVideo : onSubmitGenerate;

  /** 规则降级：用户点了"开始生成"按钮 */
  const onConfirmPlan = async (msgId: string) => {
    if (generating) return;
    const msg = messages.find((m) => m.id === msgId);
    if (!msg?.pendingPlan) return;
    const plan = msg.pendingPlan;
    setGenerating(true);
    const events: AgentEvent[] = [];
    const off = agentEvents.on((e) => events.push(e));
    // P7：模型以 PromptBar state 为准（plan 不再存 modelId）。
    // 兼容老数据：plan.modelId 若存在仍允许使用，避免老 chat 历史出 bug。
    const useModelId = plan.modelId ?? model.id;
    const useModelOpt: ModelOption =
      MODEL_OPTIONS.find((m) => m.id === useModelId) ?? model;
    const useModelName = useModelOpt.name;
    // P7：能力位预检——maxImages 与 groupGeneration 不匹配时降级 + toast
    let useMaxImages = plan.maxImages;
    if (useMaxImages && useMaxImages > 1 && !useModelOpt.capabilities.groupGeneration) {
      toast.warn(
        `${useModelName} 不支持 ${useMaxImages} 张组图，已自动改为 1 张。要 N 张变体请在 PromptBar 切到 5.0 Lite。`
      );
      useMaxImages = 1;
    }
    try {
      agentEvents.emit({
        type: "tool_start",
        toolName: "jimeng.generate_image",
        model: useModelId,
        args: { prompt: plan.prompt, size: plan.size, maxImages: useMaxImages },
      });
      // P7：规则降级也走 executePlanStream（5.0 Pro 自动 fallback 到非流式）。
      // 组图场景：partial 资产独立入库；主资产是 onCompleted 返回的（首张 partial 复用）。
      const result = await executePlanStream(
        {
          prompt: plan.prompt,
          modelId: useModelId,
          modelName: useModelName,
          size: plan.size,
          ...(plan.image ? { images: plan.image } : {}),
          ...(useMaxImages && useMaxImages > 1 ? { maxImages: useMaxImages } : {}),
          // P0：透传 sourceSkillId 让入库资产可追溯到 Skill
          ...(plan.sourceSkillId ? { sourceSkillId: plan.sourceSkillId } : {}),
          // P1：透传 styleContractId 让入库资产可被契约变更追踪
          ...(plan.styleContractId ? { styleContractId: plan.styleContractId } : {}),
        },
        currentProject.id,
        {
          onPartialFailed: (info) => {
            toast.warn(`第 ${(info.index ?? -1) + 1} 张生成失败：${info.message ?? info.code ?? "未知"}`);
          },
        }
      );
      const { asset, costMs, isDemo } = result;
      agentEvents.emit({
        type: "tool_end",
        toolName: "jimeng.generate_image",
        costMs,
        assets: [asset],
        isDemo,
      });
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId
            ? {
                ...m,
                content: "✅ 已生成。",
                pendingPlan: undefined,
                assets: [asset],
                skillLog: m.skillLog
                  ? { ...m.skillLog, costMs, isDemo, modelUsed: useModelId, modelName: useModelName }
                  : undefined,
                events: [...events, { type: "turn_end", assistantMessage: { id: msgId, role: "agent", content: "", createdAt: Date.now() } }],
              }
            : m
        )
      );
      // 持久化：把 plan 清掉 + asset_id 存上
      persistUpdate(msgId, {
        content: "✅ 已生成。",
        pendingPlan: null,
        assetIds: [asset.id],
        skillLog: msg.skillLog
          ? { ...msg.skillLog, costMs, isDemo, modelUsed: useModelId, modelName: useModelName }
          : undefined,
      });
      // 自动学习
      const userMsgs = messages.filter((m) => m.role === "user");
      const lastUserText = userMsgs.length > 0 ? userMsgs[userMsgs.length - 1].content : "";
      if (agentCtx && lastUserText) {
        await learnFromGeneration(agentCtx, lastUserText, useModelId, currentProject.id, setAgentCtx);
      }
      reload({ silent: true });
    } catch (e: any) {
      const raw = e?.message ?? String(e);
      const friendly = await explainError(raw).catch(() => raw);
      log.error("project-detail", "onConfirmPlan failed:", e);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId
            ? { ...m, content: m.content, error: friendly, pendingPlan: undefined, events: [...events] }
            : m
        )
      );
    } finally {
      off();
      setGenerating(false);
    }
  };

  /** 规则降级：用户点了"取消" */
  const onCancelPlan = (msgId: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== msgId));
    persistDelete(msgId);
  };

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
      {/* 顶部条 */}
      <div className="h-12 flex items-center gap-3 px-4 border-b border-border bg-bg-panel flex-shrink-0">
        <button onClick={onBack} className="btn-icon" title="返回项目库">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <button
            onClick={onRename}
            className="text-sm font-medium text-text-primary hover:text-accent truncate max-w-[300px] text-left"
            title="点击重命名"
          >
            {currentProject.name}
          </button>
          <div className="text-[11px] text-text-muted">
            {assets.length} 个资产
          </div>
        </div>
        <button
          onClick={() => setMemoryOpen(true)}
          className="btn text-xs h-7 px-2.5"
          title="Agent 记忆（学到的画风偏好）"
        >
          <Brain className="w-3.5 h-3.5" />
          记忆
        </button>
        <button
          onClick={onClearHistory}
          className="btn text-xs h-7 px-2.5"
          title="清空对话历史"
        >
          <Trash2 className="w-3.5 h-3.5" />
          清空对话
        </button>
      </div>

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
        ) : (
          <div className="flex-1 overflow-y-auto">
            <div className="p-4">
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
        <div className="flex items-center gap-2 mb-2">
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
            generating={generating && !!videoTaskId}
            onSubmit={onSubmit}
            onCancel={onCancelVideo}
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
          onSubmit={onSubmit}
        />
        )}
      </div>

      <AgentMemoryPanel
        open={memoryOpen}
        onClose={() => setMemoryOpen(false)}
        projectId={currentProject.id}
        onContextChange={setAgentCtx}
      />
    </div>
  );
}
