/**
 * 应用元信息（版本 / 构建标识）
 * - version: 从 package.json 直接 import（Vite 内联）
 * - gitSha: 通过 VITE_GIT_SHA 注入（构建时由 CI 写入）
 * - buildAt: 通过 VITE_BUILD_AT 注入
 */

import pkg from "../../package.json";

export const APP_VERSION: string = pkg.version;
export const APP_NAME: string = pkg.name;
export const APP_DESCRIPTION: string = pkg.description;

const env = (import.meta as unknown as { env: Record<string, string | undefined> }).env;
export const GIT_SHA: string = env.VITE_GIT_SHA ?? "dev";
export const BUILD_AT: string = env.VITE_BUILD_AT ?? "";

/** 完整构建标识，例如 "0.1.0 (dev)" 或 "0.1.0 (a1b2c3d 2026-08-19)" */
export const BUILD_TAG: string = GIT_SHA === "dev"
  ? APP_VERSION
  : `${APP_VERSION} (${GIT_SHA.slice(0, 7)}${BUILD_AT ? " " + BUILD_AT : ""})`;
