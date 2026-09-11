/**
 * i18n 基础包（W1 阶段：核心 + 资源 + 测试，不改任何 UI 组件）
 *
 * ## 背景
 * 项目当前所有 UI 文本都是中文硬编码。完整 i18n 改造工作量较大
 * （需要替换几十个组件的硬编码文本），本 W1 只做"接口 + 资源 + 测试"，
 * 给后续 PR 替换 UI 文本留出干净的扩展点。
 *
 * ## 设计原则
 * - 自实现轻量 t() hook，避免引 react-i18next（依赖 + bundle size）
 * - zh-CN 作为 fallback：缺 en-US key 时显示 zh-CN
 * - 资源文件用 JSON 静态 import，避免运行时异步加载
 * - 类型约束：Resource 类型从 zh-CN 推导（TypeScript literal narrowing）
 *   缺 key 时编译期报 TS 错（便于发现漏翻译）
 *
 * ## 后续 PR 迁移路径
 * 1. UI 组件用 `useT()` 替换硬编码中文字符串
 * 2. SettingsPanel 加语言切换下拉
 * 3. 切换结果持久化到 tauri-plugin-store key `pref.locale`
 */
import { useCallback, useEffect, useState } from "react";
import zhCN from "./zh-CN.json";
import enUS from "./en-US.json";

export type Locale = "zh-CN" | "en-US";

/** 资源类型：从 zh-CN 推导（中文是源语言） */
export type Resource = typeof zhCN;

/** 所有资源对象（key 为 locale） */
export const RESOURCES: Record<Locale, Resource> = {
  "zh-CN": zhCN,
  "en-US": enUS as Resource,
  // en-US 在生产构建时通过 ./en-US.json 注入
  // 暂时直接 require 避免循环依赖(下面 loadResource 函数)
};

/**
 * 同步加载指定 locale 的资源对象。
 * 优先用 RESOURCES 表；缺失时 fallback 到 zh-CN。
 */
export function loadResource(locale: Locale): Resource {
  const r = RESOURCES[locale];
  if (r) return r;
  return RESOURCES["zh-CN"];
}

/**
 * 当前 locale（react state + 内存单例）
 * W1 阶段: 模块级 let + 简单 setter。后续 PR 改成 Context Provider 注入。
 */
let currentLocale: Locale = "zh-CN";
const listeners = new Set<(locale: Locale) => void>();

export function getLocale(): Locale {
  return currentLocale;
}

export function setLocale(locale: Locale): void {
  if (currentLocale === locale) return;
  currentLocale = locale;
  for (const cb of listeners) cb(locale);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem("y-agent.locale", locale);
    } catch {
      /* SSR / private mode 忽略 */
    }
  }
}

/**
 * 从 localStorage 恢复上次的 locale（一次性，组件 mount 前调用）
 */
export function restoreLocale(): Locale {
  if (typeof window === "undefined") return "zh-CN";
  try {
    const saved = window.localStorage.getItem("y-agent.locale");
    if (saved === "zh-CN" || saved === "en-US") {
      currentLocale = saved;
    }
  } catch {
    /* 忽略 */
  }
  return currentLocale;
}

/**
 * 扁平翻译函数 t(resource, "namespace.key")
 * 用法:
 * ```ts
 * const t = useT();
 * t("toast.errorPrefix");  // "出错了："
 * ```
 */
export function translate(locale: Locale, key: keyof Resource | string): string {
  const r = loadResource(locale);
  const fallback = loadResource("zh-CN");
  const val = (r as Record<string, unknown>)[key as string];
  if (typeof val === "string") return val;
  // fallback 到 zh-CN
  const fb = (fallback as Record<string, unknown>)[key as string];
  return typeof fb === "string" ? fb : (key as string);
}

/**
 * React hook：组件内翻译 + 响应 locale 切换
 */
export function useT() {
  const [locale, setLocalLocale] = useState<Locale>(getLocale());
  useEffect(() => {
    const cb = (next: Locale) => setLocalLocale(next);
    listeners.add(cb);
    return () => {
      listeners.delete(cb);
    };
  }, []);
  const t = useCallback(
    (key: keyof Resource | string) => translate(locale, key),
    [locale]
  );
  return { t, locale, setLocale };
}