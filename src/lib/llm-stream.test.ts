import { describe, it, expect, vi } from "vitest";
import { runLlmStream, type LlmStreamSink } from "@/lib/llm-stream";

describe("runLlmStream (W1 占位)", () => {
  it("调用后通过 sink.onError 报告未实现", async () => {
    const onError = vi.fn();
    const sink: LlmStreamSink = { onError };
    await runLlmStream(
      {
        messages: [{ role: "user", content: "hello" }],
        apiKey: "fake",
      },
      sink
    );
    expect(onError).toHaveBeenCalledOnce();
    const err = onError.mock.calls[0][0] as Error;
    expect(err.message).toMatch(/尚未实现|W1 仅冻结/);
  });

  it("不传 sink 也不抛异常", async () => {
    // W1 实现:无 sink 时静默调用 onError,但不会 throw
    await expect(
      runLlmStream({ messages: [{ role: "user", content: "x" }], apiKey: "k" })
    ).resolves.toBeUndefined();
  });

  it("接受可选的 model / tools / baseUrl", async () => {
    const onError = vi.fn();
    await runLlmStream(
      {
        messages: [{ role: "system", content: "sys" }],
        tools: [
          {
            type: "function",
            function: {
              name: "t",
              description: "d",
              parameters: { type: "object" },
            },
          },
        ],
        model: "gpt-x",
        apiKey: "k",
        baseUrl: "https://example.com/v1",
      },
      { onError }
    );
    expect(onError).toHaveBeenCalled();
  });
});