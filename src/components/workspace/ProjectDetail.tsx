import { useEffect, useState, useRef } from "react";
import { ArrowLeft, Brain, KeyRound, Trash2 } from "lucide-react";
import { useSession } from "@/lib/session";
import { deleteAsset } from "@/lib/assets";
import { renameProject } from "@/lib/projects";
import { explainError } from "@/lib/jimeng";
import { hasApiKey } from "@/lib/api-key";
import { useToast } from "@/components/shared/Toast";
import { usePrompt } from "@/components/shared/PromptProvider";
import { confirmDialog } from "@/lib/dialog";
import { useProjectBootstrap } from "@/lib/hooks/useProjectBootstrap";
import { MODEL_OPTIONS, type Asset } from "@/lib/types";
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
import AgentMemoryPanel from "@/components/workspace/AgentMemoryPanel";
import { agentEvents, type ChatMessage, type AgentEvent } from "@/lib/agent-event";
import { route } from "@/lib/agent-router";
import { loadLlmConfig } from "@/lib/llm-config";
import { llmChatLoop, type LLMConfig, type ChatMessage as LLMChatMessage } from "@/lib/llm";
import { AGENT_TOOLS, renderSystemPrompt } from "@/lib/agent-tools";
import { executePlan, executePlanStream, learnFromGeneration } from "@/lib/agent-flow";
import { log } from "@/lib/logger";

interface Props {
  onBack: () => void;
  onOpenSettings: () => void;
}

type ViewTab = "chat" | "assets";

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
  const [outputFormat, setOutputFormat] = useState<"" | "png" | "jpeg">("");
  const [transparent, setTransparent] = useState(false);

  // 输入模式：生图（M1 直调）/ 对话（Agent 路由）
  const [inputMode, setInputMode] = useState<InputMode>("chat");

  // Agent 记忆面板开关
  const [memoryOpen, setMemoryOpen] = useState(false);

  // 每次切项目 / 每次生成完都重新检测 API Key
  useEffect(() => {
    if (!currentProject) return;
    hasApiKey().then(setHasKey).catch(() => setHasKey(false));
  }, [currentProject, generating]);

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
    setTab(inputMode === "generate" ? "assets" : "chat");
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
    setMessages((prev) => [
      ...prev,
      {
        id: agentId,
        role: "agent",
        content: "",
        events: [...events],
        createdAt: Date.now(),
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

    try {
      const { finalContent: loopContent } = await llmChatLoop(cfg, llmHistory, AGENT_TOOLS, async (name, args) => {
        if (name === "jimeng_generate_image") {
          const prompt = String(args.prompt ?? "").trim();
          if (!prompt) {
            return { result: "错误：prompt 不能为空" };
          }
          const useModel = String(args.model ?? model.id);
          const useSize = String(args.size ?? size);
          const refRequired = !!args.ref_required;
          const maxImages = Math.max(1, Math.min(4, Number(args.max_images) || 1));
          lastModel = useModel;
          const useModelOpt = MODEL_OPTIONS.find((m) => m.id === useModel) ?? model;

          if (refRequired && refs.length === 0) {
            return { result: "用户当前没有提供参考图。请先向用户说明需要参考图，或改用不依赖参考图的方案。" };
          }

          agentEvents.emit({
            type: "tool_start",
            toolName: "jimeng.generate_image",
            model: useModel,
            args: { prompt, size: useSize, refRequired, maxImages },
          });
          let imgs: { url: string }[];
          try {
            const result = await executePlan(
              {
                prompt,
                modelId: useModel,
                modelName: useModelOpt.name,
                size: useSize,
                images: refs.length > 0 ? refs : undefined,
                maxImages: maxImages > 1 ? maxImages : undefined,
              },
              currentProject.id
            );
            isDemo = result.isDemo;
            toolAssets.push(result.asset);
            imgs = result.asset.payload.urls.map((u) => ({ url: u }));
            agentEvents.emit({
              type: "tool_end",
              costMs: result.costMs,
              assets: [result.asset],
              isDemo: result.isDemo,
            });
            return {
              result: `已生成 ${imgs.length} 张图（模型 ${useModelOpt.name}，尺寸 ${useSize}，${(result.costMs / 1000).toFixed(1)}s）`,
            };
          } catch (e: any) {
            const raw = e?.message ?? String(e);
            return { result: `生成失败：${await explainError(raw).catch(() => raw)}` };
          }
        }
        return { result: `未知工具：${name}` };
      });
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
    const decision = route(userInput, model, agentCtx?.styleHints ?? []);
    agentEvents.emit({
      type: "skill_matched",
      skillName: decision.skillName ?? "(default)",
      trigger: decision.triggerType,
    });
    agentEvents.emit({ type: "turn_end", assistantMessage: { id: "", role: "agent", content: "", createdAt: Date.now() } });

    const agentId = crypto.randomUUID();
    const planGroupCount = decision.groupCount ?? groupCount;
    const plan = {
      prompt: decision.prompt,
      modelId: decision.model.id,
      modelName: decision.model.name,
      size: decision.size ?? size,
      image: refs.length > 0 ? [...refs] : undefined,
      maxImages: planGroupCount > 1 ? planGroupCount : undefined,
    };
    const skillLog = {
      matchedSkill: decision.skillName,
      triggerType: decision.triggerType,
      reasoning: decision.reasoning,
      modelUsed: decision.model.id,
      modelName: decision.model.name,
      costMs: 0,
      isDemo: false,
    };
    setMessages((prev) => [
      ...prev,
      {
        id: agentId,
        role: "agent",
        content: "（未配置 LLM，使用规则路由。请点下方「开始生成」或继续发消息调整计划。）",
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
      content: "（未配置 LLM，使用规则路由。请点下方「开始生成」或继续发消息调整计划。）",
      events: [...events],
      skillLog,
      pendingPlan: plan,
    });
  };

  const onSubmit = inputMode === "chat" ? onSubmitChat : onSubmitGenerate;

  /** 规则降级：用户点了"开始生成"按钮 */
  const onConfirmPlan = async (msgId: string) => {
    if (generating) return;
    const msg = messages.find((m) => m.id === msgId);
    if (!msg?.pendingPlan) return;
    const plan = msg.pendingPlan;
    setGenerating(true);
    const events: AgentEvent[] = [];
    const off = agentEvents.on((e) => events.push(e));
    try {
      agentEvents.emit({
        type: "tool_start",
        toolName: "jimeng.generate_image",
        model: plan.modelId,
        args: { prompt: plan.prompt, size: plan.size, maxImages: plan.maxImages },
      });
      const result = await executePlan(
        {
          prompt: plan.prompt,
          modelId: plan.modelId,
          modelName: plan.modelName,
          size: plan.size,
          images: plan.image,
          maxImages: plan.maxImages && plan.maxImages > 1 ? plan.maxImages : undefined,
        },
        currentProject.id
      );
      const { asset, costMs, isDemo } = result;
      agentEvents.emit({ type: "tool_end", costMs, assets: [asset], isDemo });
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId
            ? {
                ...m,
                content: "✅ 已生成。",
                pendingPlan: undefined,
                assets: [asset],
                skillLog: m.skillLog
                  ? { ...m.skillLog, costMs, isDemo, modelUsed: plan.modelId, modelName: plan.modelName }
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
          ? { ...msg.skillLog, costMs, isDemo, modelUsed: plan.modelId, modelName: plan.modelName }
          : undefined,
      });
      // 自动学习
      const userMsgs = messages.filter((m) => m.role === "user");
      const lastUserText = userMsgs.length > 0 ? userMsgs[userMsgs.length - 1].content : "";
      if (agentCtx && lastUserText) {
        await learnFromGeneration(agentCtx, lastUserText, plan.modelId, currentProject.id, setAgentCtx);
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
            {assets.length} 个资产 · 创建于{" "}
            {new Date(currentProject.createdAt).toLocaleDateString("zh-CN")}
          </div>
        </div>
        <div className="inline-flex rounded-md border border-border bg-bg-base p-0.5 text-xs">
          {/* 顶部"对话/资产" tab 已移除：底部输入模式 ModeSwitch 是唯一入口，
              切 inputMode 时 useEffect 会自动同步 tab。避免两套控件打架。 */}
        </div>
        <button
          onClick={() => setMemoryOpen(true)}
          className="btn-icon"
          title="Agent 记忆"
        >
          <Brain className="w-4 h-4" />
        </button>
        <button
          onClick={onClearHistory}
          className="btn-icon"
          title="清空对话历史"
        >
          <Trash2 className="w-4 h-4" />
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
        {hasKey === false && (
          <div className="mb-2 flex items-center gap-2 px-3 py-2 rounded-md bg-yellow-500/10 border border-yellow-500/30 text-xs">
            <KeyRound className="w-4 h-4 text-yellow-400 flex-shrink-0" />
            <span className="flex-1 text-text-secondary">
              还没配置即梦 API Key。填了才能生成图。
            </span>
            <button
              onClick={onOpenSettings}
              className="px-2 py-0.5 rounded bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30 text-xs font-medium"
            >
              打开设置
            </button>
          </div>
        )}
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] text-text-muted uppercase tracking-wider">输入模式</span>
          <ModeSwitch mode={inputMode} onChange={setInputMode} disabled={generating} />
          {hasKey && (
            <span className="text-[10px] text-text-muted ml-auto flex items-center gap-1">
              <KeyRound className="w-3 h-3 text-green-400" />
              Key 已配置
            </span>
          )}
          {inputMode === "chat" && agentCtx && agentCtx.styleHints.length > 0 && (
            <span className="text-[11px] text-text-muted">
              · 画风偏好：{agentCtx.styleHints.join("、")}
            </span>
          )}
        </div>
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
          onSubmit={onSubmit}
        />
      </div>

      <AgentMemoryPanel
        open={memoryOpen}
        onClose={() => setMemoryOpen(false)}
        projectId={currentProject.id}
      />
    </div>
  );
}
