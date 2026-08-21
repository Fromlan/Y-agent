import { describe, it, expect } from "vitest";
import { computeChecksum, buildStyleContract, renderStyleContract } from "@/lib/style-contract";

// ============================================================================
// P1 单测：项目级风格契约
// ============================================================================
// 覆盖：
//   1. computeChecksum：相同输入 → 相同 8 字符 hex；不同输入 → 不同
//   2. buildStyleContract：自动填 checksum / created_at / updated_at
//   3. renderStyleContract：空契约 → 空串；有字段 → 拼成 "项目风格契约" 段
// ============================================================================

describe("computeChecksum", () => {
  it("相同输入 → 8 字符 hex 相同", async () => {
    const a = await buildStyleContract({ version: 1, art_style: "二次元" });
    const b = await buildStyleContract({ version: 1, art_style: "二次元" });
    expect(a.checksum).toBe(b.checksum);
    expect(a.checksum).toMatch(/^[0-9a-f]{8}$/);
  });

  it("不同 art_style → checksum 不同", async () => {
    const a = await buildStyleContract({ version: 1, art_style: "二次元" });
    const b = await buildStyleContract({ version: 1, art_style: "写实" });
    expect(a.checksum).not.toBe(b.checksum);
  });

  it("不同 palette → checksum 不同", async () => {
    const a = await buildStyleContract({
      version: 1,
      palette: { primary: ["#3a3a3a"] },
    });
    const b = await buildStyleContract({
      version: 1,
      palette: { primary: ["#5a5a5a"] },
    });
    expect(a.checksum).not.toBe(b.checksum);
  });

  it("checksum 字段不参与自身计算（避免循环）", async () => {
    // 关键不变量：传相同 art_style / palette，checksum 字段值不同 → 算出同样的 hash
    // （created_at / updated_at 不参与，因为它们是 metadata，会随时间变）
    const base = {
      version: 1 as const,
      art_style: "二次元",
      checksum: "ffffffff",
      created_at: 0,
      updated_at: 0,
    };
    const h1 = await computeChecksum(base);
    const h2 = await computeChecksum({ ...base, checksum: "00000000" });
    expect(h1).toBe(h2);
  });
});

describe("buildStyleContract", () => {
  it("自动填 checksum / created_at / updated_at", async () => {
    const before = Date.now();
    const c = await buildStyleContract({ version: 1, art_style: "美卡" });
    expect(c.checksum).toMatch(/^[0-9a-f]{8}$/);
    expect(c.created_at).toBeGreaterThanOrEqual(before);
    expect(c.updated_at).toBeGreaterThanOrEqual(before);
  });

  it("传 created_at 时复用（更新场景）", async () => {
    const c = await buildStyleContract({
      version: 1,
      art_style: "美卡",
      created_at: 1000,
    });
    expect(c.created_at).toBe(1000);
    expect(c.updated_at).toBeGreaterThan(1000);
  });
});

describe("renderStyleContract", () => {
  it("空契约（checksum 为空）→ 返回空串", () => {
    expect(
      renderStyleContract({
        version: 1,
        checksum: "",
        created_at: 0,
        updated_at: 0,
      })
    ).toBe("");
  });

  it("art_style 字段 → 渲染 '画风：xxx' 行", async () => {
    const c = await buildStyleContract({ version: 1, art_style: "二次元" });
    const out = renderStyleContract(c);
    expect(out).toContain("项目风格契约");
    expect(out).toContain("画风：二次元");
  });

  it("palette 三色 + line_weight + light_direction 都拼上去", async () => {
    const c = await buildStyleContract({
      version: 1,
      art_style: "国风",
      palette: {
        primary: ["#3a3a3a", "#5a5a5a"],
        accent: ["#d4af37"],
        warning: ["#c0392b"],
      },
      line_weight: "medium",
      light_direction: "top-left",
    });
    const out = renderStyleContract(c);
    expect(out).toContain("主色：#3a3a3a / #5a5a5a");
    expect(out).toContain("辅色：#d4af37");
    expect(out).toContain("线宽：中线");
    expect(out).toContain("光向：左顶光");
  });

  it("line_weight 是 medium 时输出'中线'，thin → '细线'，thick → '粗线'", async () => {
    const cases: Array<["thin" | "medium" | "thick", string]> = [
      ["thin", "细线"],
      ["medium", "中线"],
      ["thick", "粗线"],
    ];
    for (const [lw, expected] of cases) {
      const c = await buildStyleContract({ version: 1, line_weight: lw });
      expect(renderStyleContract(c)).toContain(`线宽：${expected}`);
    }
  });

  it("light_direction 未知值时透传原文（不会爆错）", async () => {
    const c = await buildStyleContract({ version: 1, light_direction: "diagonal-45" as "top" });
    expect(renderStyleContract(c)).toContain("光向：diagonal-45");
  });
});
