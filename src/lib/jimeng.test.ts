import { describe, it, expect } from "vitest";
import { applyOutputFormatDefault } from "@/lib/jimeng";

describe("applyOutputFormatDefault — 5.0 系列兜底", () => {
  it("5.0 Pro 未传 outputFormat 时补 png", () => {
    const r = applyOutputFormatDefault({ model: "doubao-seedream-5-0-pro-260628", prompt: "" });
    expect(r.outputFormat).toBe("png");
  });

  it("5.0 Lite 未传 outputFormat 时补 png", () => {
    const r = applyOutputFormatDefault({ model: "doubao-seedream-5-0-lite-260628", prompt: "" });
    expect(r.outputFormat).toBe("png");
  });

  it("5.0 (260128 老版本) 未传时也补 png", () => {
    const r = applyOutputFormatDefault({ model: "doubao-seedream-5-0-260128", prompt: "" });
    expect(r.outputFormat).toBe("png");
  });

  it("5.0 显式传 png 保持 png", () => {
    const r = applyOutputFormatDefault({
      model: "doubao-seedream-5-0-lite-260628",
      prompt: "",
      outputFormat: "png",
    });
    expect(r.outputFormat).toBe("png");
  });

  it("5.0 显式传 jpeg 保持 jpeg（不强行改 png）", () => {
    const r = applyOutputFormatDefault({
      model: "doubao-seedream-5-0-lite-260628",
      prompt: "",
      outputFormat: "jpeg",
    });
    expect(r.outputFormat).toBe("jpeg");
  });
});

describe("applyOutputFormatDefault — 4.5/4.0 不设", () => {
  it("4.5 未传 outputFormat 时保持 undefined（API 默认 jpeg）", () => {
    const r = applyOutputFormatDefault({ model: "jimeng-4.5", prompt: "" });
    expect(r.outputFormat).toBeUndefined();
  });

  it("4.0 未传时保持 undefined", () => {
    const r = applyOutputFormatDefault({ model: "jimeng-4.0", prompt: "" });
    expect(r.outputFormat).toBeUndefined();
  });

  it("4.5 显式传 jpeg 保持 jpeg", () => {
    const r = applyOutputFormatDefault({
      model: "jimeng-4.5",
      prompt: "",
      outputFormat: "jpeg",
    });
    expect(r.outputFormat).toBe("jpeg");
  });
});

describe("applyOutputFormatDefault — 不修改其它字段", () => {
  it("保留 prompt / image / size 等其它参数", () => {
    const r = applyOutputFormatDefault({
      model: "doubao-seedream-5-0-lite-260628",
      prompt: "hello",
      size: "2k",
    });
    expect(r.prompt).toBe("hello");
    expect(r.size).toBe("2k");
  });

  it("未知模型未传时保持 undefined", () => {
    const r = applyOutputFormatDefault({ model: "unknown-model", prompt: "" });
    expect(r.outputFormat).toBeUndefined();
  });
});
