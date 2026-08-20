import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@/lib/agent-event";
import type { AgentEvent } from "@/lib/agent-event";
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
        <Sparkles className="w-4 h-4 text-white" />
      </div>
      <div className="max-w-[80%] flex-1 min-w-0">
        <div className="text-xs text-text-muted mb-1">Y-agent</div>
        {message.error ? (
          <div className="text-sm text-red-400 bg-red-400/10 px-3 py-2 rounded border border-red-400/20">
            ❌ {message.error}
          </div>
        ) : (
          <>
            {message.skillLog && (
              <SkillLog log={message.skillLog} events={message.events} />
            )}
            {message.content && (
              <div className="md-content mt-2">
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
              </div>
            )}
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
            className="btn text-text-muted hover:text-red-400 flex items-center gap-1.5"
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
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-8"
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
            <span className="ml-1 px-1 rounded bg-yellow-500/20 text-yellow-400 text-[10px]">
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
