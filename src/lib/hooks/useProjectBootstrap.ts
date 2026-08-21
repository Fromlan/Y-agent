/**
 * useProjectBootstrap — 进入 / 切换项目时统一加载所有项目级数据
 *
 * 把散落在 ProjectDetail 里的多个 useEffect / useState 集中起来：
 *   - assets 列表（+ reload / silentReload 合并版）
 *   - 默认偏好（default_model / default_size）
 *   - Agent Memory
 *   - 对话 session + 历史
 *   - hasApiKey 检测
 *
 * 调用方只需要传 projectId，剩下的全自动。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { listAssets } from "@/lib/assets";
import { getPref } from "@/lib/prefs";
import { hasApiKey } from "@/lib/api-key";
import { loadAgentContext, type AgentContext } from "@/lib/agent-memory";
import {
  getOrCreateSession,
  listMessages,
} from "@/lib/chat-history";
import { enrichMessagesWithAssets } from "@/lib/chat-enrich";
import {
  startAssetEventListener,
  stopAssetEventListener,
} from "@/lib/asset-events";
import { useToast } from "@/components/shared/Toast";
import { MODEL_OPTIONS, type Asset, type ModelOption } from "@/lib/types";
import type { ChatMessage } from "@/lib/agent-event";
import { log } from "@/lib/logger";

export interface ProjectBootstrapState {
  // 数据
  assets: Asset[];
  setAssets: React.Dispatch<React.SetStateAction<Asset[]>>;
  loading: boolean;
  agentCtx: AgentContext | null;
  setAgentCtx: (c: AgentContext) => void;
  chatSessionId: string | null;
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  hasKey: boolean | null;

  // 偏好（外部需要 set 给 PromptBar 用）
  model: ModelOption;
  setModel: (m: ModelOption) => void;
  size: string;
  setSize: (s: string) => void;

  // 操作
  reload: (opts?: { silent?: boolean }) => Promise<void>;
}

export function useProjectBootstrap(projectId: string | undefined): ProjectBootstrapState {
  const toast = useToast();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [agentCtx, setAgentCtx] = useState<AgentContext | null>(null);
  const [chatSessionId, setChatSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [model, setModel] = useState<ModelOption>(MODEL_OPTIONS[0]);
  const [size, setSize] = useState("2k");

  /** 防止同一项目 id 重复触发 effect（currentProject 引用变化时） */
  const lastLoadedProjectIdRef = useRef<string | null>(null);

  const reload = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      if (!projectId) return;
      if (!opts.silent) setLoading(true);
      try {
        setAssets(await listAssets(projectId));
      } catch (e: any) {
        if (opts.silent) {
          log.error("project-bootstrap", "silent reload failed:", e);
        } else {
          toast.error(`加载资产失败：${e?.message ?? e}`);
        }
      } finally {
        if (!opts.silent) setLoading(false);
      }
    },
    [projectId, toast]
  );

  // 切换到新项目时：清状态 + 加载一切
  useEffect(() => {
    if (!projectId) return;
    if (lastLoadedProjectIdRef.current === projectId) return;
    lastLoadedProjectIdRef.current = projectId;

    // 重置旧状态，避免上个项目的消息泄漏
    setAssets([]);
    setMessages([]);
    setChatSessionId(null);
    setAgentCtx(null);
    setHasKey(null);

    reload({ silent: false });
    hasApiKey().then(setHasKey).catch(() => setHasKey(false));

    // 默认偏好
    getPref("default_model")
      .then((v) => {
        if (v) {
          const m = MODEL_OPTIONS.find((o) => o.id === v);
          if (m) setModel(m);
        }
      })
      .catch((e) => log.error("project-bootstrap", "load default_model pref failed:", e));
    getPref("default_size")
      .then((v) => {
        if (v) setSize(v);
      })
      .catch((e) => log.error("project-bootstrap", "load default_size pref failed:", e));

    // Agent Memory
    loadAgentContext(projectId)
      .then(setAgentCtx)
      .catch((e) => log.error("project-bootstrap", "load agent context failed:", e));

    // 对话历史
    (async () => {
      try {
        const sid = await getOrCreateSession(projectId);
        setChatSessionId(sid);
        const msgs = await listMessages(sid);
        const enriched = await enrichMessagesWithAssets(projectId, msgs);
        setMessages(enriched);
      } catch (e) {
        log.error("project-bootstrap", "load chat history failed:", e);
      }
    })();
  }, [projectId, reload]);

  // 订阅后端"资产本地兜底完成"事件,增量更新单条资产。
  // - 不重建 assets 数组引用,React 只 patch 那一条,避免 AssetBoard 整板 re-render
  // - projectId 切换时重新订阅(实际 listener 是模块级单例,这里是参数 projectId 过滤)
  useEffect(() => {
    if (!projectId) return;
    const apply = (evt: { projectId: string; assetId: string; localPaths?: string[]; layerLocalPaths?: string[] }) => {
      // 跨项目事件:AssetCenter 模式会监听所有;此处按当前 projectId 过滤
      if (evt.projectId !== projectId) return;
      setAssets((prev) =>
        prev.map((a) => {
          if (a.id !== evt.assetId) return a;
          // urls 模式资产用 localPaths;layers 模式用 layerLocalPaths;后端两个字段都给,
          // 这里按资产自身形态选用。
          const isLayer = a.isLayerDecomposition && a.payload.layers?.length;
          const next = { ...a, payload: { ...a.payload } };
          if (isLayer) {
            if (evt.layerLocalPaths) next.payload.layerLocalPaths = evt.layerLocalPaths;
          } else {
            if (evt.localPaths) next.payload.localPaths = evt.localPaths;
          }
          return next;
        })
      );
    };
    startAssetEventListener(apply);
    return () => {
      stopAssetEventListener(apply);
    };
  }, [projectId]);

  return {
    assets,
    setAssets,
    loading,
    agentCtx,
    setAgentCtx,
    chatSessionId,
    messages,
    setMessages,
    hasKey,
    model,
    setModel,
    size,
    setSize,
    reload,
  };
}
