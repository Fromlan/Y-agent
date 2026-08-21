/**
 * H3-Context-IR 视频提示词增强 客户端单测。
 *
 * 覆盖：
 * - 正常路径（mock invoke 返回成功）→ optimizeVideoPrompt 返回 isOptimized=true
 * - 失败兜底（mock invoke 返回 fallback reason）→ 不抛，结果用原 prompt
 * - 抛错（mock invoke reject）→ 抛给上层（仅 Key 未设置会抛，其他情况由 Rust 兜底）
 * - explainOptimizeReason / isOptimizeSuccess 文本与判定
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// 收集 invoke 调用,便于验证入参透传
const invokeCalls: Array<{ name: string; args: unknown }> = [];
let mockInvokeImpl: ((name: string, args: unknown) => Promise<unknown>) | null = null;

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (name: string, args: unknown) => {
    invokeCalls.push({ name, args });
    if (!mockInvokeImpl) {
      throw new Error("mockInvokeImpl not set");
    }
    return mockInvokeImpl(name, args);
  }),
}));

import {
  optimizeVideoPrompt,
  explainOptimizeReason,
  isOptimizeSuccess,
  type H3OptimizeResult,
  type OptimizeParams,
} from "@/lib/h3-context-ir";

beforeEach(() => {
  invokeCalls.length = 0;
  mockInvokeImpl = null;
});

const baseParams: OptimizeParams = {
  model: "MiniMax-H3",
  content: [{ type: "text", text: "宇航员在月球跳舞" }],
  duration: 5,
  ratio: "16:9",
};

// ----------------------------------------------------------------------------
// optimizeVideoPrompt
// ----------------------------------------------------------------------------

describe("optimizeVideoPrompt", () => {
  it("happy path: 真实 API 增强成功", async () => {
    mockInvokeImpl = async (name, args) => {
      expect(name).toBe("jimeng_h3_optimize");
      expect((args as { originalPrompt: string }).originalPrompt).toBe(
        "宇航员在月球跳舞"
      );
      const result: H3OptimizeResult = {
        prompt:
          "Cinematic, wide shot: an astronaut dances on the moon, slow motion, 24fps",
        isOptimized: true,
        reason: "ok",
      };
      return result;
    };

    const r = await optimizeVideoPrompt(baseParams, "宇航员在月球跳舞");
    expect(r.isOptimized).toBe(true);
    expect(r.reason).toBe("ok");
    expect(r.prompt).toContain("Cinematic");
    // 校验 invoke 收到正确的入参 shape
    expect(invokeCalls[0].name).toBe("jimeng_h3_optimize");
    const args = invokeCalls[0].args as { params: OptimizeParams; originalPrompt: string };
    expect(args.params.model).toBe("MiniMax-H3");
    expect(args.params.duration).toBe(5);
    expect(args.params.ratio).toBe("16:9");
    expect(args.originalPrompt).toBe("宇航员在月球跳舞");
  });

  it("demo path: reason='demo'", async () => {
    mockInvokeImpl = async () => {
      return {
        prompt: "[AI 增强 Demo] 宇航员在月球跳舞 · 电影感运镜, 24fps",
        isOptimized: true,
        reason: "demo",
      };
    };

    const r = await optimizeVideoPrompt(baseParams, "宇航员在月球跳舞");
    expect(r.isOptimized).toBe(true);
    expect(r.reason).toBe("demo");
  });

  it("fallback path: 限流时返回原 prompt,不抛", async () => {
    mockInvokeImpl = async () => {
      return {
        prompt: "宇航员在月球跳舞", // Rust 兜底透传原 prompt
        isOptimized: false,
        reason: "rate_limit",
      };
    };

    const r = await optimizeVideoPrompt(baseParams, "宇航员在月球跳舞");
    expect(r.isOptimized).toBe(false);
    expect(r.reason).toBe("rate_limit");
    expect(r.prompt).toBe("宇航员在月球跳舞"); // 必须是原 prompt
  });

  it("fallback path: 网络异常 reason='network'", async () => {
    mockInvokeImpl = async () => {
      return { prompt: "原 prompt", isOptimized: false, reason: "network" };
    };
    const r = await optimizeVideoPrompt(baseParams, "原 prompt");
    expect(r.isOptimized).toBe(false);
    expect(r.reason).toBe("network");
  });

  it("fallback path: 内容敏感 reason='sensitive'", async () => {
    mockInvokeImpl = async () => {
      return { prompt: "原 prompt", isOptimized: false, reason: "sensitive" };
    };
    const r = await optimizeVideoPrompt(baseParams, "原 prompt");
    expect(r.reason).toBe("sensitive");
  });

  it("fallback path: 超时 reason='timeout'", async () => {
    mockInvokeImpl = async () => {
      return { prompt: "原 prompt", isOptimized: false, reason: "timeout" };
    };
    const r = await optimizeVideoPrompt(baseParams, "原 prompt");
    expect(r.reason).toBe("timeout");
  });

  it("fallback path: 鉴权失败 reason='auth'", async () => {
    mockInvokeImpl = async () => {
      return { prompt: "原 prompt", isOptimized: false, reason: "auth" };
    };
    const r = await optimizeVideoPrompt(baseParams, "原 prompt");
    expect(r.reason).toBe("auth");
  });

  it("fallback path: content.prompt 为空 reason='empty_response'", async () => {
    mockInvokeImpl = async () => {
      return { prompt: "原 prompt", isOptimized: false, reason: "empty_response" };
    };
    const r = await optimizeVideoPrompt(baseParams, "原 prompt");
    expect(r.reason).toBe("empty_response");
  });

  it("key 未设置: invoke reject,调用方需 catch", async () => {
    // Rust 端唯一会抛 Err 的场景: 视频 API Key 未设置
    mockInvokeImpl = async () => {
      throw new Error("视频 API Key 未设置");
    };

    await expect(optimizeVideoPrompt(baseParams, "原 prompt")).rejects.toThrow(
      "视频 API Key 未设置"
    );
  });

  it("入参透传: i2va 场景 content 含 first_frame", async () => {
    mockInvokeImpl = async () => {
      return { prompt: "p", isOptimized: true, reason: "ok" };
    };
    const params: OptimizeParams = {
      model: "MiniMax-H3",
      content: [
        { type: "image_url", image_url: { url: "data:," }, role: "first_frame" },
      ],
      duration: 5,
    };
    await optimizeVideoPrompt(params, "测试");
    const args = invokeCalls[0].args as { params: OptimizeParams };
    expect(args.params.content[0]).toMatchObject({ role: "first_frame" });
  });

  it("入参透传: r2va 场景 ratio 可选, 不传时 undefined", async () => {
    mockInvokeImpl = async () => {
      return { prompt: "p", isOptimized: true, reason: "ok" };
    };
    const params: OptimizeParams = {
      model: "MiniMax-H3",
      content: [
        { type: "image_url", image_url: { url: "data:," }, role: "reference_image" },
      ],
      duration: 5,
    };
    await optimizeVideoPrompt(params, "测试");
    const args = invokeCalls[0].args as { params: OptimizeParams };
    expect(args.params.ratio).toBeUndefined();
  });
});

// ----------------------------------------------------------------------------
// explainOptimizeReason
// ----------------------------------------------------------------------------

describe("explainOptimizeReason", () => {
  it("ok / demo 返回 null（不需要弹 toast）", () => {
    expect(explainOptimizeReason("ok")).toBeNull();
    expect(explainOptimizeReason("demo")).toBeNull();
  });

  it("失败 reason 都有中文短句", () => {
    expect(explainOptimizeReason("rate_limit")).toBe("API 限流");
    expect(explainOptimizeReason("auth")).toBe("鉴权失败");
    expect(explainOptimizeReason("insufficient_balance")).toBe("余额不足");
    expect(explainOptimizeReason("sensitive")).toBe("触发内容审核");
    expect(explainOptimizeReason("invalid_param")).toBe("参数错误");
    expect(explainOptimizeReason("timeout")).toBe("优化超时");
    expect(explainOptimizeReason("network")).toBe("网络异常");
    expect(explainOptimizeReason("parse")).toBe("响应解析失败");
    expect(explainOptimizeReason("empty_response")).toBe("返回为空");
    expect(explainOptimizeReason("skipped")).toBe("用户跳过");
  });
});

// ----------------------------------------------------------------------------
// isOptimizeSuccess
// ----------------------------------------------------------------------------

describe("isOptimizeSuccess", () => {
  it("ok / demo 算成功", () => {
    expect(isOptimizeSuccess("ok")).toBe(true);
    expect(isOptimizeSuccess("demo")).toBe(true);
  });

  it("其他 reason 都算失败", () => {
    expect(isOptimizeSuccess("rate_limit")).toBe(false);
    expect(isOptimizeSuccess("auth")).toBe(false);
    expect(isOptimizeSuccess("network")).toBe(false);
    expect(isOptimizeSuccess("sensitive")).toBe(false);
    expect(isOptimizeSuccess("timeout")).toBe(false);
    expect(isOptimizeSuccess("invalid_param")).toBe(false);
    expect(isOptimizeSuccess("empty_response")).toBe(false);
    expect(isOptimizeSuccess("parse")).toBe(false);
    expect(isOptimizeSuccess("skipped")).toBe(false);
    expect(isOptimizeSuccess("insufficient_balance")).toBe(false);
  });
});
