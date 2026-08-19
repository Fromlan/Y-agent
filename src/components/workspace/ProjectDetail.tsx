import { useEffect, useState, useCallback } from "react";
import { ArrowLeft, MessageSquare, Image as ImageIcon, Brain, KeyRound, Trash2 } from "lucide-react";
import { useSession } from "@/lib/session";
import { listAssets, deleteAsset, createAsset } from "@/lib/assets";
import { renameProject } from "@/lib/projects";
import { generateImage, explainError } from "@/lib/jimeng";
import { getPref } from "@/lib/prefs";
import { hasApiKey } from "@/lib/api-key";
import { useToast } from "@/components/shared/Toast";
import {
  MODEL_OPTIONS,
  type Asset,
  type ModelOption,
  type AssetPayload,
} from "@/lib/types";
import {
  getOrCreateSession,
  listMessages,
  insertMessage,
  updateMessage,
  deleteMessage as dbDeleteMessage,
  clearSession as dbClearSession,
  assetIds as dbAssetIds,
} from "@/lib/chat-history";
import PromptBar from "@/components/workspace/PromptBar";
import AssetBoard from "@/components/workspace/AssetBoard";
import ChatMessageList from "@/components/workspace/ChatMessageList";
import ModeSwitch, { type InputMode } from "@/components/workspace/ModeSwitch";
import AgentMemoryPanel from "@/components/workspace/AgentMemoryPanel";
import { agentEvents, type ChatMessage, type AgentEvent } from "@/lib/agent-event";
import { route } from "@/lib/agent-router";
import {
  loadAgentContext,
  addStyleHints,
  recordModel,
  saveAgentContext,
  type AgentContext,
} from "@/lib/agent-memory";
import { loadLlmConfig } from "@/lib/llm-config";
import { llmChatLoop, type LLMConfig, type ChatMessage as LLMChatMessage } from "@/lib/llm";
import { AGENT_TOOLS, renderSystemPrompt } from "@/lib/agent-tools";

interface Props {
  onBack: () => void;
  onOpenSettings: () => void;
}

type ViewTab = "chat" | "assets";

export default function ProjectDetail({ onBack, onOpenSettings }: Props) {
  const { currentProject, setCurrentProject } = useSession();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const toast = useToast();

  // 视图 tab：对话 / 资产
  const [tab, setTab] = useState<ViewTab>("chat");

  // 共享输入态
  const [prompt, setPrompt] = useState("");
  const [refs, setRefs] = useState<string[]>([]);
  const [model, setModel] = useState<ModelOption>(MODEL_OPTIONS[0]);
  const [size, setSize] = useState("2k");
  const [groupCount, setGroupCount] = useState(1);
  const [layerDecomp, setLayerDecomp] = useState(false);
  const [generating, setGenerating] = useState(false);

  // 输入模式：生图（M1 直调）/ 对话（Agent 路由）
  const [inputMode, setInputMode] = useState<InputMode>("chat");

  // Agent 记忆面板开关
  const [memoryOpen, setMemoryOpen] = useState(false);

  // 对话流（仅在 chat tab 下展示）
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  // chat_session id（项目内唯一）
  const [chatSessionId, setChatSessionId] = useState<string | null>(null);

  // Agent Memory（项目级）
  const [agentCtx, setAgentCtx] = useState<AgentContext | null>(null);

  const reload = useCallback(async () => {
    if (!currentProject) return;
    setLoading(true);
    try {
      setAssets(await listAssets(currentProject.id));
    } catch (e: any) {
      toast.error(`加载资产失败：${e?.message ?? e}`);
    } finally {
      setLoading(false);
    }
  }, [currentProject, toast]);

  const silentReload = useCallback(async () => {
    if (!currentProject) return;
    try {
      setAssets(await listAssets(currentProject.id));
    } catch (e: any) {
      console.error("silentReload failed:", e);
    }
  }, [currentProject]);

  useEffect(() => {
    if (currentProject) reload();
  }, [currentProject, reload]);

  // 进入项目时：加载默认偏好 + Agent Memory + 对话历史
  useEffect(() => {
    if (!currentProject) return;
    getPref("default_model")
      .then((v) => {
        if (v) {
          const m = MODEL_OPTIONS.find((o) => o.id === v);
          if (m) setModel(m);
        }
      })
      .catch(console.error);
    getPref("default_size")
      .then((v) => {
        if (v) setSize(v);
      })
      .catch(console.error);
    loadAgentContext(currentProject.id).then(setAgentCtx).catch(console.error);
    // 加载对话历史
    (async () => {
      try {
        const sid = await getOrCreateSession(currentProject.id);
        setChatSessionId(sid);
        const msgs = await listMessages(sid);
        // 把 assetIds 还原成 assets（用当前 assets 表的数据）
        const enriched = await enrichWithAssets(msgs);
        setMessages(enriched);
      } catch (e) {
        console.error("加载对话历史失败:", e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProject?.id]);

  /** 把消息里的 assetIds 反查成完整 Asset 对象（用当前 assets 表的数据） */
  const enrichWithAssets = useCallback(
    async (msgs: ChatMessage[]): Promise<ChatMessage[]> => {
      // 收集所有 assetId
      const idSet = new Set<string>();
      msgs.forEach((m) => {
        if ((m as any).assetIds) (m as any).assetIds.forEach((id: string) => idSet.add(id));
      });
      if (idSet.size === 0) return msgs;
      // 从 assets 表查
      const allAssets = await listAssets(currentProject!.id);
      const map = new Map(allAssets.map((a) => [a.id, a]));
      return msgs.map((m) => {
        const ids: string[] = (m as any).assetIds ?? [];
        const assets = ids.map((id) => map.get(id)).filter((a): a is Asset => !!a);
        return { ...m, assets: assets.length > 0 ? assets : undefined };
      });
    },
    [currentProject]
  );

  // 进入项目时检测 API Key（以及每次生成后重新检测，应对用户从设置切回来的情况）
  useEffect(() => {
    if (!currentProject) return;
    hasApiKey().then(setHasKey).catch(() => setHasKey(false));
  }, [currentProject?.id, generating]);

  // 模式切换时同步主视图 tab：
  // - 生图模式 → 资产列表（M1 体验）
  // - 对话模式 → 聊天气泡流
  // 用户可手动覆盖 tab（例如对话模式下想翻历史资产）
  useEffect(() => {
    if (inputMode === "generate") {
      setTab("assets");
    } else {
      setTab("chat");
    }
  }, [inputMode]);

  if (!currentProject) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-muted">
        未选择项目
      </div>
    );
  }

  const onRename = async () => {
    const name = window.prompt("新项目名", currentProject.name);
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
    if (!window.confirm("确认删除这个资产？")) return;
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
    setGenerating(true);
    const start = Date.now();
    try {
      const resp = await generateImage({
        model: model.id,
        prompt: prompt.trim(),
        image: refs.length > 0 ? refs : undefined,
        size,
        sequential: groupCount > 1 ? "auto" : undefined,
        maxImages: groupCount > 1 ? groupCount : undefined,
        layerDecomposition: model.supportsLayerDecomposition && layerDecomp ? true : undefined,
      });
      const costMs = Date.now() - start;
      const isLayer = !!(model.supportsLayerDecomposition && layerDecomp);
      const payload: AssetPayload = isLayer
        ? { urls: [], layers: resp.images }
        : { urls: resp.images.map((i) => i.url) };
      try {
        await createAsset({
          projectId: currentProject.id,
          prompt: prompt.trim(),
          model: model.id,
          modelName: model.name,
          size,
          refCount: refs.length,
          costMs,
          isLayerDecomposition: isLayer,
          payload,
        });
        await silentReload();
        toast.success("已入库到资产库");
        setPrompt("");
        setRefs([]);
      } catch (saveErr: any) {
        console.error("save asset failed:", saveErr);
        toast.warn(`资产入库失败：${saveErr?.message ?? saveErr}`);
      }
    } catch (e: any) {
      const raw = e?.message ?? String(e);
      const friendly = await explainError(raw).catch(() => raw);
      toast.error(friendly);
    } finally {
      setGenerating(false);
    }
  };

  // -------------------------------------------------------------------------
  // 对话模式 submit：优先走 LLM 真对话；未配 LLM 时降级到规则 + 计划确认
  // -------------------------------------------------------------------------
  const onSubmitChat = async () => {
    if (!prompt.trim()) {
      toast.warn("请输入提示词");
      return;
    }
    const text = prompt.trim();
    setPrompt("");
    if (tab !== "chat") setTab("chat");

    if (!chatSessionId) {
      toast.error("对话会话未就绪，请重试");
      return;
    }

    // 用户消息入流 + 入库
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      attachments: refs.length > 0 ? [...refs] : undefined,
      createdAt: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    insertMessage(chatSessionId, {
      id: userMsg.id,
      role: "user",
      content: text,
      attachments: refs.length > 0 ? [...refs] : undefined,
    }).catch(console.error);

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
    insertMessage(chatSessionId!, {
      id: agentId,
      role: "agent",
      content: "",
      events: [...events],
    })
      .catch((e) => console.error("save agent placeholder failed:", e));
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

    await llmChatLoop(cfg, llmHistory, AGENT_TOOLS, async (name, args) => {
      if (name === "jimeng_generate_image") {
        const prompt = String(args.prompt ?? "").trim();
        if (!prompt) {
          return { result: "错误：prompt 不能为空" };
        }
        const useModel = String(args.model ?? model.id);
        const useSize = String(args.size ?? size);
        const refRequired = !!args.ref_required;
        lastModel = useModel;
        const useModelOpt = MODEL_OPTIONS.find((m) => m.id === useModel) ?? model;

        agentEvents.emit({
          type: "tool_start",
          toolName: "jimeng.generate_image",
          model: useModel,
          args: { prompt, size: useSize, refRequired },
        });
        const t0 = Date.now();
        let imgs;
        try {
          const resp = await generateImage({
            model: useModel,
            prompt,
            image: refs.length > 0 ? refs : undefined,
            size: useSize,
          });
          imgs = resp.images;
          isDemo = resp.isDemo;
        } catch (e: any) {
          const raw = e?.message ?? String(e);
          return { result: `生成失败：${await explainError(raw).catch(() => raw)}` };
        }
        const costMs = Date.now() - t0;
        // 入库
        const asset = await createAsset({
          projectId: currentProject.id,
          prompt,
          model: useModel,
          modelName: useModelOpt.name,
          size: useSize,
          refCount: refs.length,
          costMs,
          isLayerDecomposition: false,
          payload: { urls: imgs.map((i) => i.url) },
        });
        toolAssets.push(asset);
        agentEvents.emit({
          type: "tool_end",
          costMs,
          assets: [asset],
          isDemo,
        });
        return {
          result: `已生成 ${imgs.length} 张图（模型 ${useModelOpt.name}，尺寸 ${useSize}，${(costMs / 1000).toFixed(1)}s）`,
        };
      }
      return { result: `未知工具：${name}` };
    })
      .then((r) => {
        finalContent = r.finalContent;
      })
      .catch((e) => {
        throw e;
      });

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
    updateMessage(agentId, {
      content: finalContent,
      events: [...events],
      skillLog,
      assetIds: toolAssets.length > 0 ? dbAssetIds(toolAssets) : null,
    }).catch((e) => console.error("update agent message failed:", e));

    // 自动学习
    if (agentCtx) {
      const updated = addStyleHints(agentCtx, userInput);
      const withModel = recordModel(updated, lastModel);
      setAgentCtx(withModel);
      saveAgentContext(currentProject.id, withModel).catch(console.error);
    }
    silentReload();
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
    const plan = {
      prompt: decision.prompt,
      modelId: decision.model.id,
      modelName: decision.model.name,
      size,
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
    insertMessage(chatSessionId!, {
      id: agentId,
      role: "agent",
      content: "（未配置 LLM，使用规则路由。请点下方「开始生成」或继续发消息调整计划。）",
      events: [...events],
      skillLog,
      pendingPlan: plan,
    }).catch((e) => console.error("save plan message failed:", e));
  };

  const onSubmit = inputMode === "chat" ? onSubmitChat : onSubmitGenerate;

  /** 规则降级：用户点了"开始生成"按钮 */
  const onConfirmPlan = async (msgId: string) => {
    const msg = messages.find((m) => m.id === msgId);
    if (!msg?.pendingPlan) return;
    const plan = msg.pendingPlan;
    setGenerating(true);
    const start = Date.now();
    const events: AgentEvent[] = [];
    const off = agentEvents.on((e) => events.push(e));
    try {
      agentEvents.emit({
        type: "tool_start",
        toolName: "jimeng.generate_image",
        model: plan.modelId,
        args: { prompt: plan.prompt, size: plan.size },
      });
      const resp = await generateImage({
        model: plan.modelId,
        prompt: plan.prompt,
        image: refs.length > 0 ? refs : undefined,
        size: plan.size,
      });
      const costMs = Date.now() - start;
      agentEvents.emit({ type: "tool_end", costMs, assets: [], isDemo: resp.isDemo });
      const asset = await createAsset({
        projectId: currentProject.id,
        prompt: plan.prompt,
        model: plan.modelId,
        modelName: plan.modelName,
        size: plan.size,
        refCount: refs.length,
        costMs,
        isLayerDecomposition: false,
        payload: { urls: resp.images.map((i) => i.url) },
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
                  ? { ...m.skillLog, costMs, isDemo: resp.isDemo, modelUsed: plan.modelId, modelName: plan.modelName }
                  : undefined,
                events: [...events, { type: "turn_end", assistantMessage: { id: msgId, role: "agent", content: "", createdAt: Date.now() } }],
              }
            : m
        )
      );
      // 持久化：把 plan 清掉 + asset_id 存上
      updateMessage(msgId, {
        content: "✅ 已生成。",
        pendingPlan: null,
        assetIds: [asset.id],
        skillLog: msg.skillLog
          ? { ...msg.skillLog, costMs, isDemo: resp.isDemo, modelUsed: plan.modelId, modelName: plan.modelName }
          : undefined,
      }).catch((e) => console.error("update confirmed plan failed:", e));
      // 自动学习
      const userMsgs = messages.filter((m) => m.role === "user");
      const lastUserText = userMsgs.length > 0 ? userMsgs[userMsgs.length - 1].content : "";
      if (agentCtx && lastUserText) {
        const updated = addStyleHints(agentCtx, lastUserText);
        const withModel = recordModel(updated, plan.modelId);
        setAgentCtx(withModel);
        saveAgentContext(currentProject.id, withModel).catch(console.error);
      }
      silentReload();
    } catch (e: any) {
      const raw = e?.message ?? String(e);
      const friendly = await explainError(raw).catch(() => raw);
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
    dbDeleteMessage(msgId).catch((e) => console.error("delete plan failed:", e));
  };

  /** 清空所有对话历史 */
  const onClearHistory = async () => {
    if (!chatSessionId) return;
    if (!window.confirm("确认清空所有对话历史？\n\n项目内的资产不会被删除（它们在「资产」tab 里）。")) return;
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
          <button
            onClick={() => setTab("chat")}
            className={`flex items-center gap-1 px-2.5 py-1 rounded transition-colors ${
              tab === "chat" ? "bg-bg-hover text-text-primary" : "text-text-muted hover:text-text-secondary"
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            对话
          </button>
          <button
            onClick={() => setTab("assets")}
            className={`flex items-center gap-1 px-2.5 py-1 rounded transition-colors ${
              tab === "assets" ? "bg-bg-hover text-text-primary" : "text-text-muted hover:text-text-secondary"
            }`}
          >
            <ImageIcon className="w-3.5 h-3.5" />
            资产
          </button>
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
                    for (const id of ids) {
                      await deleteAsset(id);
                    }
                    setAssets((prev) => prev.filter((a) => !ids.includes(a.id)));
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
