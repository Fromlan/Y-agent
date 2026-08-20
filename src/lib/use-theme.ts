/**
 * 主题 hook。
 *
 * - 状态：当前主题 id（持久化到 Rust KV "pref.theme"）
 * - 副作用：把主题 id 写到 <html data-theme="xxx">，触发 CSS 变量切换
 * - 应用启动时（main.tsx 注入的 inline script）会先同步一次，避免 FOUC
 */

import { useCallback, useEffect, useState } from "react";
import { getPref, setPref } from "@/lib/prefs";
import {
  DEFAULT_THEME_ID,
  THEMES,
  isThemeId,
  type ThemeMeta,
} from "@/lib/themes";

const PREF_THEME = "pref.theme";

/** 把主题 id 同步到 <html data-theme>，调用方需保证 id 合法 */
function applyTheme(id: ThemeMeta["id"]) {
  if (typeof document === "undefined") return;
  if (id === DEFAULT_THEME_ID) {
    // 默认主题：移除属性，由 :root 兜底
    delete document.documentElement.dataset.theme;
  } else {
    document.documentElement.dataset.theme = id;
  }
}

/**
 * 应用启动时同步一次（避免 React 挂载前的 FOUC）。
 * 暴露给 main.tsx 同步调用。
 */
export function applyInitialTheme(): ThemeMeta["id"] {
  // 同步读 localStorage 缓存（prefs 异步，先用 localStorage 兜底）
  let id: ThemeMeta["id"] = DEFAULT_THEME_ID;
  try {
    const cached = localStorage.getItem(PREF_THEME);
    if (isThemeId(cached)) id = cached;
  } catch {
    /* localStorage 不可用就用默认 */
  }
  applyTheme(id);
  return id;
}

/** 组件里用的 hook，读取 pref 并在切换时持久化 */
export function useTheme(): {
  theme: ThemeMeta["id"];
  setTheme: (id: ThemeMeta["id"]) => void;
  meta: ThemeMeta;
  themes: ThemeMeta[];
} {
  const [theme, setThemeState] = useState<ThemeMeta["id"]>(DEFAULT_THEME_ID);

  // 启动时：异步从 Rust 拿持久化值（prefs 比 localStorage 权威）
  useEffect(() => {
    let cancelled = false;
    getPref(PREF_THEME)
      .then((v) => {
        if (cancelled) return;
        if (isThemeId(v)) {
          setThemeState(v);
          applyTheme(v);
        }
      })
      .catch(() => {
        /* 拿不到就用默认 */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setTheme = useCallback((id: ThemeMeta["id"]) => {
    if (!isThemeId(id)) return;
    setThemeState(id);
    applyTheme(id);
    // 写 localStorage 缓存（给下次冷启动的 inline script 兜底）
    try {
      localStorage.setItem(PREF_THEME, id);
    } catch {
      /* ignore */
    }
    // 持久化到 Rust KV
    setPref(PREF_THEME, id).catch((e) => {
      // eslint-disable-next-line no-console
      console.warn("setPref theme failed:", e);
    });
  }, []);

  const meta = THEMES.find((t) => t.id === theme) ?? THEMES[0];
  return { theme, setTheme, meta, themes: THEMES };
}
