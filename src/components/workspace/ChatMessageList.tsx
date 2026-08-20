import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@/lib/agent-event";
import type { AgentEvent, ToolCallRecord } from "@/lib/agent-event";
import type { Asset } from "@/lib/types";
import { assetMainImage } from "@/lib/types";
import { Sparkles, ChevronDown, ChevronRight, Clock, Zap, Check, X } from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import SafeImage from "@/components/shared/SafeImage";

interface Props {
  messages: ChatMessage[];
  generating?: boolean;
  /** 规则降级模式：用户点了"开始生成" */
  onConfirmPlan?: (msgId: string) => void;
  /** 规则降级模式：用户点了"取消" */
  onCancelPlan?: (msgId: string) => void;
}

/**
 * 对话流渲染：
 * - 用户消息右对齐
 * - Agent 消息左对齐，含折叠日志（命中 Skill / 调用模型 / 耗时）
 * - Agent 消息生成的资产缩略图（点击可放大，复用 AssetCard 暂 v0.1 简化为 img）
 */
export default function ChatMessageList({ messages, generating, onConfirmPlan, onCancelPlan }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, generating]);

  if (messages.length === 0 && !generating) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-muted text-sm">
        <div className="text-center max-w-md">
          <Sparkles className="w-8 h-8 mx-auto mb-3 text-accent" />
          <p className="font-medium text-text-secondary">和 Y-agent 对话生成游戏美术</p>
          <p className="text-xs mt-2 leading-relaxed">
            在下方输入框描述你的需求，或输入 <code className="px-1 py-0.5 bg-bg-hover rounded">/</code> 选择预置 Skill
            <br />
            （角色三视图、九宫格表情、UI 图标、KV 海报等）
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {messages.map((m) => (
        <MessageItem
          key={m.id}
          message={m}
          onConfirmPlan={onConfirmPlan ? () => onConfirmPlan(m.id) : undefined}
          onCancelPlan={onCancelPlan ? () => onCancelPlan(m.id) : undefined}
        />
      ))}
      {generating && (
        <div className="flex items-center gap-2 text-text-muted text-sm pl-2">
          <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
          Agent 正在生成...
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}

function MessageItem({
  message,
  onConfirmPlan,
  onCancelPlan,
}: {
  message: ChatMessage;
  onConfirmPlan?: () => void;
  onCancelPlan?: () => void;
}) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[70%]">
          {message.attachments && message.attachments.length > 0 && (
            <div className="flex flex-wrap gap-1 justify-end mb-1">
              {message.attachments.map((a, i) => (
                <SafeImage
                  key={i}
                  src={a}
                  alt=""
                  className="w-12 h-12 rounded object-cover border border-border"
                />
              ))}
            </div>
          )}
          <div className="bg-accent/15 text-text-primary px-3 py-2 rounded-lg text-sm whitespace-pre-wrap break-words">
            {message.content}
          </div>
        </div>
      </div>
    );
  }

  // agent
  return (
    <div className="flex gap-2">
      <div className="w-7 h-7 rounded-md bg-accent flex items-center justify-center flex-shrink-0">
        <Sparkles className="w-4 h-4 text-text-inverse" />
      </div>
      <div className="max-w-[80%] flex-1 min-w-0">
        <div className="text-xs text-text-muted mb-1">Y-agent</div>
        {message.error ? (
          <div
            className="text-sm px-3 py-2 rounded border"
            style={{
              color: "var(--status-danger)",
              backgroundColor:
                "color-mix(in srgb, var(--status-danger) 10%, transparent)",
              borderColor:
                "color-mix(in srgb, var(--status-danger) 25%, transparent)",
            }}
          >
            ❌ {message.error}
          </div>
        ) : (
          <>
            {message.skillLog && (
              <SkillLog log={message.skillLog} events={message.events} />
            )}
            {/* P6：工具调用内联显示（按调用顺序） */}
            {message.toolCalls && message.toolCalls.length > 0 && (
              <div className="mt-2 space-y-1.5">
                {message.toolCalls.map((tc) => (
                  <ToolCallCard key={tc.id} tc={tc} />
                ))}
              </div>
            )}
            {/* P6：流式内容 + 等待态 + 光标 */}
            {message.content || message.pending || message.streaming ? (
              <div className="md-content mt-2 relative">
                {message.pending && !message.content && (
                  <PendingDots text="思考中…" />
                )}
                {message.content && (
                  <>
                    <Markdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        a: ({ href, children }) => (
                          <a href={href} target="_blank" rel="noopener noreferrer">
                            {children}
                          </a>
                        ),
                      }}
                    >
                      {message.content}
                    </Markdown>
                    {message.streaming && <BlinkingCursor />}
                  </>
                )}
              </div>
            ) : null}
            {message.pendingPlan && onConfirmPlan && (
              <PlanCard
                plan={message.pendingPlan}
                onConfirm={onConfirmPlan}
                onCancel={onCancelPlan}
              />
            )}
            {message.assets && message.assets.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-2">
                {message.assets.map((a) => (
                  <AssetThumb key={a.id} asset={a} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function PlanCard({
  plan,
  onConfirm,
  onCancel,
}: {
  plan: NonNullable<ChatMessage["pendingPlan"]>;
  onConfirm: () => void;
  onCancel?: () => void;
}) {
  return (
    <div className="mt-2 panel p-3 space-y-2 border-accent/40">
      <div className="text-xs text-text-muted">📋 待执行计划</div>
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div>
          <div className="text-text-muted">模型</div>
          <div className="text-text-primary font-medium truncate">{plan.modelName}</div>
        </div>
        <div>
          <div className="text-text-muted">尺寸</div>
          <div className="text-text-primary font-medium">{plan.size}</div>
        </div>
        <div>
          <div className="text-text-muted">prompt 长度</div>
          <div className="text-text-primary font-medium">{plan.prompt.length} 字</div>
        </div>
      </div>
      <details className="text-xs">
        <summary className="cursor-pointer text-text-secondary hover:text-text-primary">
          查看完整 prompt
        </summary>
        <pre className="mt-1 p-2 bg-bg-base rounded text-[11px] whitespace-pre-wrap break-all text-text-secondary">
          {plan.prompt}
        </pre>
      </details>
      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={onConfirm}
          className="btn btn-primary flex items-center gap-1.5"
        >
          <Check className="w-3.5 h-3.5" />
          开始生成
        </button>
        {onCancel && (
          <button
            onClick={onCancel}
            className="btn text-text-muted hover:text-accent-danger flex items-center gap-1.5"
          >
            <X className="w-3.5 h-3.5" />
            取消
          </button>
        )}
        <span className="text-[11px] text-text-muted ml-auto">
          继续发消息可重新规划
        </span>
      </div>
    </div>
  );
}

function mainUrl(asset: Asset): string {
  // P5：localPath 优先（P5 后的资产）；缺失时回退 url
  return asset.payload.localPaths?.[0] ?? assetMainImage(asset) ?? "";
}

function AssetThumb({ asset }: { asset: Asset }) {
  const [open, setOpen] = useState(false);
  const url = mainUrl(asset);
  if (!url) return null;
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="aspect-square rounded overflow-hidden border border-border hover:border-accent transition-colors"
      >
        <SafeImage src={url} alt="" className="w-full h-full object-cover" />
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 bg-bg-overlay flex items-center justify-center p-8"
          onClick={() => setOpen(false)}
        >
          <SafeImage src={url} alt="" className="max-w-full max-h-full" />
        </div>
      )}
    </>
  );
}

function SkillLog({
  log,
  events,
}: {
  log: NonNullable<ChatMessage["skillLog"]>;
  events?: AgentEvent[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-bg-panel border border-border rounded-md text-xs">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-text-secondary hover:text-text-primary"
      >
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        <Zap className="w-3 h-3 text-accent" />
        <span className="font-medium">
          {log.matchedSkill
            ? `命中 Skill：${log.matchedSkill}`
            : "默认生图"}
        </span>
        <span className="text-text-muted ml-auto flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {(log.costMs / 1000).toFixed(1)}s
          {log.isDemo && (
            <span
              className="ml-1 px-1 rounded text-[10px]"
              style={{
                color: "var(--status-warn)",
                backgroundColor:
                  "color-mix(in srgb, var(--status-warn) 18%, transparent)",
              }}
            >
              DEMO
            </span>
          )}
        </span>
      </button>
      {open && (
        <div className="px-3 py-2 border-t border-border space-y-1 text-text-muted">
          <div>
            <span className="text-text-secondary">触发方式：</span>
            {triggerLabel(log.triggerType)}
          </div>
          <div>
            <span className="text-text-secondary">模型：</span>
            {log.modelName}
          </div>
          <div>
            <span className="text-text-secondary">理由：</span>
            <span className="md-content md-compact inline">
              <Markdown remarkPlugins={[remarkGfm]}>{log.reasoning}</Markdown>
            </span>
          </div>
          {events && events.length > 0 && (
            <details className="pt-1">
              <summary className="cursor-pointer text-text-secondary hover:text-text-primary">
                完整事件流（{events.length}）
              </summary>
              <div className="mt-1 space-y-0.5 text-[10px] font-mono">
                {events.map((e, i) => (
                  <div key={i} className="text-text-muted">
                    {String(i + 1).padStart(2, "0")} {e.type}
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

function triggerLabel(t: "explicit" | "keyword" | "fallback") {
  if (t === "explicit") return <span className="text-accent">显式（/xxx）</span>;
  if (t === "keyword") return <span className="text-accent">关键词匹配</span>;
  return <span className="text-text-muted">默认</span>;
}

// ============================================================================
// P6：流式输出 + 工具调用展示
// ============================================================================

/** 工具调用卡片（内联在 chat 流里） */
function ToolCallCard({ tc }: { tc: ToolCallRecord }) {
  const [open, setOpen] = useState(false);
  const isRunning = tc.status === "running";
  const isFailed = tc.status === "failed";
  return (
    <div
      className={`border rounded-md text-xs overflow-hidden transition-colors ${
        isFailed
          ? "border-red-400/30 bg-red-400/5"
          : isRunning
          ? "border-accent/40 bg-accent/5"
          : "border-border bg-bg-panel"
      }`}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-left hover:bg-bg-hover/50"
      >
        {open ? (
          <ChevronDown className="w-3 h-3 text-text-muted flex-shrink-0" />
        ) : (
          <ChevronRight className="w-3 h-3 text-text-muted flex-shrink-0" />
        )}
        <Zap className={`w-3 h-3 flex-shrink-0 ${isRunning ? "text-accent animate-pulse" : "text-accent"}`} />
        <span className="font-mono text-text-primary truncate flex-1 min-w-0">
          {tc.toolName}
        </span>
        {isRunning && (
          <span className="text-text-muted text-[10px] flex items-center gap-1">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
            运行中
          </span>
        )}
        {tc.status === "done" && tc.costMs !== undefined && (
          <span className="text-text-muted text-[10px] tabular-nums">
            {(tc.costMs / 1000).toFixed(1)}s
          </span>
        )}
        {isFailed && (
          <span className="text-accent-danger text-[10px]">失败</span>
        )}
      </button>
      {open && (
        <div className="px-3 py-2 border-t border-border space-y-1.5 text-text-muted">
          {tc.result && (
            <div className="text-text-secondary">{tc.result}</div>
          )}
          <details>
            <summary className="cursor-pointer text-text-secondary hover:text-text-primary text-[10px]">
              参数
            </summary>
            <pre className="mt-1 p-1.5 bg-bg-base rounded text-[10px] whitespace-pre-wrap break-all text-text-muted max-h-40 overflow-y-auto">
              {JSON.stringify(tc.args, null, 2)}
            </pre>
          </details>
          {tc.assets && tc.assets.length > 0 && (
            <div className="text-[10px] text-text-muted">
              已生成 {tc.assets.length} 张图（见下方）
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** 流式光标（CSS 动画，不引入 framer-motion） */
function BlinkingCursor() {
  return (
    <span
      aria-hidden
      className="inline-block w-1.5 h-3.5 ml-0.5 align-text-bottom bg-accent animate-pulse"
      style={{ verticalAlign: "-0.2em" }}
    />
  );
}

/** 等待态（LLM 还没回任何字） */
function PendingDots({ text }: { text: string }) {
  return (
    <span className="text-text-muted text-sm flex items-center gap-1.5">
      {text}
      <span className="inline-flex gap-0.5">
        <span className="w-1 h-1 rounded-full bg-text-muted animate-bounce" style={{ animationDelay: "0ms" }} />
        <span className="w-1 h-1 rounded-full bg-text-muted animate-bounce" style={{ animationDelay: "150ms" }} />
        <span className="w-1 h-1 rounded-full bg-text-muted animate-bounce" style={{ animationDelay: "300ms" }} />
      </span>
    </span>
  );
}
