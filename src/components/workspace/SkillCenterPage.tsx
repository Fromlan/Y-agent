import { useEffect, useMemo, useState } from "react";
import {
  Wand2,
  Search,
  Copy,
  Check,
  Hash,
  Cpu,
  Ruler,
  ImageIcon,
  Layers,
  CheckCircle2,
} from "lucide-react";
import { useToast } from "@/components/shared/Toast";
import { loadBuiltinSkills, type Skill } from "@/lib/skill";
import { useSession } from "@/lib/session";

/**
 * Skill 中心
 * - 列出所有内置 Skill（v0.1 来自 import.meta.glob 打包）
 * - 左：搜索 + 列表
 * - 右：详情（triggers / 描述 / 推荐参数 / 模板预览）
 * - 复制 trigger 词、复制模板正文
 * - 选完 Skill 后可"跳到当前项目去用"（设置 currentProject 路由到 project）
 */
export default function SkillCenterPage() {
  const toast = useToast();
  const { currentProject } = useSession();

  const all = useMemo(() => loadBuiltinSkills(), []);

  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(all[0]?.id ?? null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.triggers.some((t) => t.toLowerCase().includes(q))
    );
  }, [all, query]);

  const selected = useMemo(
    () => all.find((s) => s.id === selectedId) ?? filtered[0] ?? all[0] ?? null,
    [all, filtered, selectedId]
  );

  // 搜索结果变化时：如果当前选中不在结果中，自动跳到第一个
  useEffect(() => {
    if (selected && !filtered.some((s) => s.id === selected.id) && filtered.length > 0) {
      setSelectedId(filtered[0].id);
    }
  }, [filtered, selected]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* 顶部栏 */}
      <header className="h-12 flex items-center px-4 border-b border-border flex-shrink-0 gap-4">
        <div className="flex items-center gap-2">
          <Wand2 className="w-4 h-4 text-accent" />
          <h1 className="text-sm font-semibold text-text-primary">Skill 中心</h1>
          <span className="text-[10px] text-text-muted">预设提示词模板 · {all.length} 个</span>
        </div>
        <div className="flex-1 max-w-sm">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索 Skill（名字 / 描述 / trigger）"
              className="w-full pl-8 pr-3 py-1.5 text-sm bg-bg-elev border border-border rounded-md
                text-text-primary placeholder:text-text-muted
                focus:outline-none focus:border-accent transition-colors"
            />
          </div>
        </div>
        <div className="flex-1" />
        {currentProject ? (
          <span className="text-[11px] text-text-secondary">
            当前项目：<b className="text-text-primary">{currentProject.name}</b>
          </span>
        ) : (
          <span className="text-[11px] text-text-muted">尚未进入项目</span>
        )}
      </header>

      {/* 主体：左列表 + 右详情 */}
      <div className="flex-1 flex min-h-0">
        {/* 左侧：Skill 列表 */}
        <div className="w-80 flex-shrink-0 border-r border-border overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="p-6 text-center text-text-muted text-xs">
              没有匹配的 Skill
            </div>
          ) : (
            <ul className="p-2 space-y-1">
              {filtered.map((s) => {
                const active = selected?.id === s.id;
                return (
                  <li key={s.id}>
                    <button
                      onClick={() => setSelectedId(s.id)}
                      className={`w-full text-left p-2.5 rounded-md border transition-colors
                        ${
                          active
                            ? "bg-accent/10 border-accent"
                            : "bg-bg-elev border-border hover:border-border-strong"
                        }
                      `}
                    >
                      <div className="flex items-start gap-2">
                        <Wand2
                          className={`w-3.5 h-3.5 flex-shrink-0 mt-0.5 ${
                            active ? "text-accent" : "text-text-muted"
                          }`}
                        />
                        <div className="flex-1 min-w-0">
                          <div
                            className={`text-sm font-medium truncate ${
                              active ? "text-accent" : "text-text-primary"
                            }`}
                          >
                            {s.name}
                          </div>
                          <div className="text-[11px] text-text-muted truncate">
                            /{s.id}
                          </div>
                          <div className="text-[11px] text-text-secondary line-clamp-2 mt-1 leading-snug">
                            {s.description}
                          </div>
                          <div className="flex flex-wrap items-center gap-1 mt-1.5">
                            {s.triggers
                              .filter((t) => t.startsWith("/"))
                              .slice(0, 2)
                              .map((t) => (
                                <span
                                  key={t}
                                  className="text-[10px] px-1.5 py-0.5 rounded bg-bg-base text-text-muted font-mono"
                                >
                                  {t}
                                </span>
                              ))}
                            {s.refRequired && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/20 text-accent flex items-center gap-0.5">
                                <ImageIcon className="w-2.5 h-2.5" /> 需参考
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* 右侧：详情面板 */}
        <div className="flex-1 overflow-y-auto">
          {selected ? (
            <SkillDetail key={selected.id} skill={selected} onCopyToast={toast} />
          ) : (
            <div className="h-full flex items-center justify-center text-text-muted text-sm">
              从左侧选择一个 Skill
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SkillDetail({
  skill,
  onCopyToast,
}: {
  skill: Skill;
  onCopyToast: ReturnType<typeof useToast>;
}) {
  const [copied, setCopied] = useState(false);
  const [triggerCopied, setTriggerCopied] = useState<string | null>(null);

  const onCopyTemplate = () => {
    navigator.clipboard.writeText(skill.template).then(
      () => {
        onCopyToast.success("已复制模板正文");
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => onCopyToast.error("复制失败")
    );
  };

  const onCopyTrigger = (t: string) => {
    navigator.clipboard.writeText(t).then(
      () => {
        onCopyToast.success(`已复制 ${t}`);
        setTriggerCopied(t);
        setTimeout(() => setTriggerCopied(null), 1500);
      },
      () => onCopyToast.error("复制失败")
    );
  };

  return (
    <div className="p-6 max-w-3xl space-y-5">
      {/* 标题区 */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Wand2 className="w-5 h-5 text-accent" />
          <h2 className="text-lg font-semibold text-text-primary">{skill.name}</h2>
        </div>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span className="font-mono">/{skill.id}</span>
          {skill.refRequired && (
            <span className="flex items-center gap-1 text-accent">
              <CheckCircle2 className="w-3 h-3" /> 需参考图
            </span>
          )}
        </div>
        {skill.description && (
          <p className="text-sm text-text-secondary mt-2 leading-relaxed">
            {skill.description}
          </p>
        )}
      </div>

      {/* 触发词 */}
      <section>
        <h3 className="text-[10px] text-text-muted uppercase tracking-wider mb-2">
          触发词
        </h3>
        <div className="flex flex-wrap items-center gap-1.5">
          {skill.triggers.map((t) => {
            const isCopied = triggerCopied === t;
            return (
              <button
                key={t}
                onClick={() => onCopyTrigger(t)}
                className={`text-xs h-7 px-2.5 rounded-md border font-mono transition-colors flex items-center gap-1
                  ${
                    isCopied
                      ? "bg-accent/20 border-accent text-accent"
                      : "bg-bg-elev border-border text-text-secondary hover:text-text-primary hover:border-border-strong"
                  }
                `}
                title="点击复制"
              >
                {isCopied ? (
                  <Check className="w-3 h-3" />
                ) : (
                  <Hash className="w-3 h-3" />
                )}
                {t}
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-text-muted mt-2">
          提示：在项目输入框里以 <code className="text-accent">/</code> 开头的命令会自动唤起
          Skill picker。
        </p>
      </section>

      {/* 推荐参数 */}
      <section>
        <h3 className="text-[10px] text-text-muted uppercase tracking-wider mb-2">
          推荐参数
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {skill.modelHint && (
            <MetaBox icon={Cpu} label="模型" value={skill.modelHint} />
          )}
          {skill.size && <MetaBox icon={Ruler} label="尺寸" value={skill.size} />}
          {skill.groupCount !== undefined && (
            <MetaBox
              icon={Layers}
              label="数量"
              value={`${skill.groupCount} 张`}
            />
          )}
          <MetaBox
            icon={ImageIcon}
            label="参考图"
            value={skill.refRequired ? "必须" : "可选"}
          />
        </div>
      </section>

      {/* 模板预览 */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-[10px] text-text-muted uppercase tracking-wider">
            模板正文
          </h3>
          <button
            onClick={onCopyTemplate}
            className="btn text-xs h-7 px-2.5"
            title="复制模板正文到剪贴板"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5" /> 已复制
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" /> 复制
              </>
            )}
          </button>
        </div>
        <pre className="text-sm text-text-primary leading-relaxed whitespace-pre-wrap
          bg-bg-elev border border-border rounded-md p-3 max-h-[420px] overflow-y-auto font-mono">
          {skill.template}
        </pre>
        <p className="text-[11px] text-text-muted mt-2">
          模板里的 <code className="text-accent">{"{{user_input}}"}</code> 会在使用时替换为你的原话。
        </p>
      </section>
    </div>
  );
}

function MetaBox({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Cpu;
  label: string;
  value: string;
}) {
  return (
    <div className="bg-bg-elev border border-border rounded-md p-2">
      <div className="flex items-center gap-1 text-[10px] text-text-muted mb-0.5">
        <Icon className="w-3 h-3" />
        <span>{label}</span>
      </div>
      <div className="text-xs text-text-primary truncate" title={value}>
        {value}
      </div>
    </div>
  );
}
