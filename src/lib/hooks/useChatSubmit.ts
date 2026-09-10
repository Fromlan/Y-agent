/**
 * useChatSubmit — 对话模式下的 5 个提交相关 callback 集中
 *
 * 把 ProjectDetail 里 chat 流的所有 callback 1:1 搬过来:
 *   - onSubmitChat: 入口,读 prompt/refs,分发到 LLM 或规则路由
 *   - runLlmTurn: LLM 路径(400+ 行 OpenAI 兼容流式循环 + 工具调用)
 *   - runRulePlan: 规则路由(展示 PlanCard,等用户点确认)
 *   - onConfirmPlan: 用户点"开始生成",执行计划
 *   - onCancelPlan: 用户点"取消",删除消息
 *
 * 行为零改动。1:1 搬动原则(plan commit 12 风险缓解条款)。
 * 零测试覆盖 → 实施后需手动跑 chat 冒烟 4 步(见 plan 验收清单)。
 */
import { useCallback, type MutableRefObject } from "react";
import { useToast } from "@/components/shared/Toast";
import { explainError } from "@/lib/jimeng";
import { log } from "@/lib/logger";
import { llmChatLoop, type LLMConfig, type ChatMessage as LLMChatMessage } from "@/lib/llm";
import { loadLlmConfig } from "@/lib/llm-config";
import { AGENT_TOOLS, renderSystemPrompt } from "@/lib/agent-tools";
import { useRulePlan } from "./useRulePlan";
import { usePlanActions } from "./usePlanActions";
import { executePlanStream, learnFromGeneration } from "@/lib/agent-flow";
import { agentEvents, type AgentEvent, type ChatMessage, type ToolCallRecord } from "@/lib/agent-event";
import { assetIds as dbAssetIds, persistInsert, persistUpdate } from "@/lib/chat-history";
import { MODEL_OPTIONS, type Asset, type ModelOption, type CharacterArchive } from "@/lib/types";
import type { AgentContext } from "@/lib/agent-memory";
import type { StyleContract } from "@/lib/style-contract";

export type ViewTab = "chat" | "assets" | "tools" | "characters";

export interface UseChatSubmitArgs {
  // 表单 + 视图
  prompt: string;
  setPrompt: (v: string) => void;
  refs: string[];
  setRefs: (v: string[]) => void;
  tab: ViewTab;
  setTab: (t: ViewTab) => void;
  // chat session
  chatSessionId: string | null;
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  // agent 上下文
  agentCtx: AgentContext | null;
  setAgentCtx: (c: AgentContext) => void;
  // 当前项目
  currentProjectId: string;
  // 偏好
  model: ModelOption;
  size: string;
  groupCount: number;
  styleContract: StyleContract | null;
  styleContractId: string | undefined;
  // M3 角色档案
  characterArchives: CharacterArchive[];
  setSelectedArchiveId: (id: string | null) => void;
  reloadCharacterArchives: () => Promise<void>;
  pendingCharacterArchiveRef: MutableRefObject<CharacterArchive | null>;
  // 控制
  generating: boolean;
  setGenerating: (v: boolean) => void;
  reload: (opts?: { silent?: boolean }) => Promise<void>;
  toast: ReturnType<typeof useToast>;
}

export interface UseChatSubmitAPI {
  onSubmitChat: () => Promise<void>;
  onConfirmPlan: (msgId: string) => Promise<void>;
  onCancelPlan: (msgId: string) => void;
}

export function useChatSubmit(args: UseChatSubmitArgs): UseChatSubmitAPI {
  const {
    prompt, setPrompt, refs, setRefs, tab, setTab,
    chatSessionId, messages, setMessages,
    agentCtx, setAgentCtx,
    currentProjectId,
    model, size, groupCount, styleContract, styleContractId,
    characterArchives, setSelectedArchiveId, reloadCharacterArchives, pendingCharacterArchiveRef,
    generating, setGenerating, reload, toast,
  } = args;

  
  // 规则路由 + PlanCard 由 useRulePlan 封装
  const runRulePlan = useRulePlan({
    model,
    size,
    refs,
    agentCtx,
    styleContract,
    styleContractId,
    groupCount,
    chatSessionId,
    setMessages,
  });

  // PlanCard 的"开始生成/取消" 由 usePlanActions 封装
  const { onConfirmPlan, onCancelPlan } = usePlanActions({
    model,
    messages,
    setMessages,
    agentCtx,
    setAgentCtx,
    currentProjectId,
    generating,
    setGenerating,
    reload,
    toast,
  });

const onSubmitChat = useCallback(async () => {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generating, prompt, setPrompt, refs, setRefs, tab, setTab, chatSessionId, setMessages, toast]);

  /** LLM 路径：把当前 messages + system prompt + tools 给 LLM，循环直到没有 tool_call */

  const runLlmTurn = useCallback(async (
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
          // M3：注入项目 + 全局角色档案，让 LLM 知道有哪些可选
          characterArchives: characterArchives.map((a) => ({
            id: a.id,
            name: a.name,
            description: a.description,
            scope: a.scope,
            referenceImageAssetIds: a.referenceImageAssetIds,
          })),
          // M3: 项目级风格契约（AgentMemoryPanel 折叠 section 可编辑）
          styleContract: styleContract ?? undefined,
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
          // M3：Agent 调 character_use_archive 后的处理
          // - 校验 archiveId 存在
          // - 把档案存到 pendingCharacterArchiveRef，next jimeng_generate_image 会拼到 prompt
          // - 自增 agentUseCount 计数
          if (name === "character_use_archive") {
            const archiveId = String(args.archiveId ?? "").trim();
            if (!archiveId) {
              return { result: "错误：archiveId 不能为空" };
            }
            const tcId = crypto.randomUUID();
            appendToolCall({
              id: tcId,
              toolName: "character.use_archive",
              args: { archiveId },
              status: "running",
            });
            try {
              const { getCharacterArchive, incrementAgentUseCount } = await import(
                "@/lib/character-archive"
              );
              const archive = await getCharacterArchive(archiveId);
              if (!archive) {
                updateToolCall(tcId, {
                  status: "failed",
                  result: `未找到档案 ${archiveId.slice(0, 8)}…（可能已被删除）`,
                });
                return {
                  result: `未找到档案 ${archiveId}。请先在角色工坊建档，或换其他档案。`,
                };
              }
              pendingCharacterArchiveRef.current = archive;
              // 同步到 React state，让 UI 反映 PromptBar 当前档案被 Agent 选中
              setSelectedArchiveId(archiveId);
              // 自增计数器
              await incrementAgentUseCount(archiveId).catch(() => null);
              // reload archives 列表（counter 变了）
              void reloadCharacterArchives();
              updateToolCall(tcId, {
                status: "done",
                result: `已选择档案「${archive.name}」(${archive.referenceImageAssetIds.length} 张参考图, scope=${archive.scope}),下一次 jimeng_generate_image 会自动注入 prompt`,
              });
              return {
                result: `已选择档案「${archive.name}」(参考图 ${archive.referenceImageAssetIds.length} 张)。请继续调 jimeng_generate_image 工具完成生图,prompt 会自动包含 [角色档案] 段。`,
              };
            } catch (e: any) {
              const msg = e?.message ?? String(e);
              updateToolCall(tcId, { status: "failed", result: msg });
              return { result: `character_use_archive 失败：${msg}` };
            }
          }
          if (name === "jimeng_generate_image") {
            let prompt = String(args.prompt ?? "").trim();
            if (!prompt) {
              return { result: "错误：prompt 不能为空" };
            }
            // M3：Agent 调 character_use_archive 后,把档案拼到 prompt
            // 用完即清（一次性消费），避免下次生图仍被注入
            const pendingArchive = pendingCharacterArchiveRef.current;
            if (pendingArchive) {
              const { renderCharacterArchive } = await import("@/lib/character-archive");
              const archiveBlock = renderCharacterArchive(pendingArchive);
              if (archiveBlock) {
                prompt = `${prompt}\n\n${archiveBlock}`;
              }
              pendingCharacterArchiveRef.current = null;
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
              // M3：角色档案(也写入 payload 留痕)
              if (pendingArchive) {
                streamPlan.characterArchive = pendingArchive;
              }
              const result = await executePlanStream(
                streamPlan,
                currentProjectId,
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
      await learnFromGeneration(agentCtx, userInput, lastModel, currentProjectId, setAgentCtx);
    }
    reload({ silent: true });
  }, [chatSessionId, setMessages, agentCtx, setAgentCtx, model, size, refs, characterArchives, styleContract, styleContractId, currentProjectId, toast, setSelectedArchiveId, reloadCharacterArchives, pendingCharacterArchiveRef, messages, reload]);

  /** 规则降级：展示计划，等用户点确认才生图 */
  
  return { onSubmitChat, onConfirmPlan, onCancelPlan };
}
