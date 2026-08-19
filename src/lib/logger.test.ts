import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { log } from "@/lib/logger";

describe("logger", () => {
  let debugSpy: ReturnType<typeof vi.spyOn>;
  let infoSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    debugSpy.mockRestore();
    infoSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("debug 输出到 console.debug，带 tag 前缀", () => {
    log.debug("test", "hello", 123);
    expect(debugSpy).toHaveBeenCalledOnce();
    const call = debugSpy.mock.calls[0];
    expect(call[0]).toContain("[DEBUG]");
    expect(call[0]).toContain("[test]");
    expect(call[1]).toBe("hello");
    expect(call[2]).toBe(123);
  });

  it("info 输出到 console.info", () => {
    log.info("test");
    expect(infoSpy).toHaveBeenCalledOnce();
  });

  it("warn 输出到 console.warn", () => {
    log.warn("test", "danger");
    expect(warnSpy).toHaveBeenCalledOnce();
  });

  it("error 输出到 console.error", () => {
    log.error("test", new Error("oops"));
    expect(errorSpy).toHaveBeenCalledOnce();
    const call = errorSpy.mock.calls[0];
    expect(call[1]).toBeInstanceOf(Error);
  });
});
