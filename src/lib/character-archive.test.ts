/**
 * M3 角色档案纯函数层测试
 * 覆盖：query / sort / aggregate / validate / makeEmpty / isReferenced / summarize / formatArchiveUpdated
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  queryCharacterArchives,
  sortByUpdated,
  aggregateAllTags,
  validateArchiveUpsert,
  makeEmptyArchive,
  isReferencedAsReference,
  findArchivesReferencingAsset,
  summarizeArchivesForPrompt,
  renderCharacterArchive,
  formatArchiveUpdated,
  CHARACTER_ARCHIVE_LIMITS,
  DEFAULT_SCOPE_QUERY,
} from "@/lib/character-archive";
import type {
  CharacterArchive,
  CharacterArchiveUpsert,
} from "@/lib/types";

// 工厂函数：快速构造测试用 archive
function makeArchive(overrides: Partial<CharacterArchive> = {}): CharacterArchive {
  return {
    id: "id-1",
    scope: "project",
    projectId: "proj-A",
    name: "红发火焰法师",
    description: "20 岁女性,火焰系魔法",
    referenceImageAssetIds: ["asset-1", "asset-2"],
    styleContractId: null,
    promptSnippet: "",
    tags: ["火焰", "法师"],
    agentUseCount: 0,
    createdAt: 1000,
    updatedAt: 2000,
    ...overrides,
  };
}

describe("sortByUpdated", () => {
  it("按 updatedAt DESC 排序", () => {
    const a = makeArchive({ id: "a", updatedAt: 100 });
    const b = makeArchive({ id: "b", updatedAt: 300 });
    const c = makeArchive({ id: "c", updatedAt: 200 });
    const out = sortByUpdated([a, b, c]);
    expect(out.map((x) => x.id)).toEqual(["b", "c", "a"]);
  });

  it("updatedAt 相同则按 name 升序兜底", () => {
    const a = makeArchive({ id: "a", name: "Z", updatedAt: 100 });
    const b = makeArchive({ id: "b", name: "A", updatedAt: 100 });
    expect(sortByUpdated([a, b]).map((x) => x.id)).toEqual(["b", "a"]);
  });

  it("不修改原数组", () => {
    const a = makeArchive({ id: "a", updatedAt: 100 });
    const b = makeArchive({ id: "b", updatedAt: 200 });
    const orig = [a, b];
    sortByUpdated(orig);
    expect(orig[0].id).toBe("a");
    expect(orig[1].id).toBe("b");
  });
});

describe("queryCharacterArchives - scope 过滤", () => {
  it("默认 scope = ['project','global'] 合并", () => {
    expect(DEFAULT_SCOPE_QUERY).toEqual(["project", "global"]);
  });

  it("project scope 匹配 projectId", () => {
    const a = makeArchive({ id: "a", scope: "project", projectId: "proj-A" });
    const b = makeArchive({ id: "b", scope: "project", projectId: "proj-B" });
    const c = makeArchive({ id: "c", scope: "global", projectId: null });
    const out = queryCharacterArchives([a, b, c], { projectId: "proj-A" });
    expect(out.map((x) => x.id).sort()).toEqual(["a", "c"].sort());
  });

  it("scope=['project'] 排除 global", () => {
    const a = makeArchive({ id: "a", scope: "project", projectId: "proj-A" });
    const b = makeArchive({ id: "b", scope: "global", projectId: null });
    const out = queryCharacterArchives([a, b], {
      projectId: "proj-A",
      scope: ["project"],
    });
    expect(out.map((x) => x.id)).toEqual(["a"]);
  });

  it("scope=['global'] 排除 project", () => {
    const a = makeArchive({ id: "a", scope: "project", projectId: "proj-A" });
    const b = makeArchive({ id: "b", scope: "global", projectId: null });
    const out = queryCharacterArchives([a, b], {
      projectId: "proj-A",
      scope: ["global"],
    });
    expect(out.map((x) => x.id)).toEqual(["b"]);
  });

  it("空数组返回空", () => {
    expect(queryCharacterArchives([], { projectId: "proj-A" })).toEqual([]);
  });
});

describe("queryCharacterArchives - tag AND 过滤", () => {
  it("AND 语义：必须包含所有指定标签", () => {
    const a = makeArchive({ id: "a", tags: ["火焰", "法师", "女性"] });
    const b = makeArchive({ id: "b", tags: ["火焰", "战士"] });
    const c = makeArchive({ id: "c", tags: ["法师"] });
    const out = queryCharacterArchives([a, b, c], {
      projectId: "proj-A",
      tagFilter: ["火焰", "法师"],
    });
    expect(out.map((x) => x.id)).toEqual(["a"]);
  });

  it("空 tagFilter 不过滤", () => {
    const a = makeArchive({ id: "a" });
    const b = makeArchive({ id: "b" });
    const out = queryCharacterArchives([a, b], { projectId: "proj-A" });
    expect(out.length).toBe(2);
  });
});

describe("queryCharacterArchives - 名称搜索", () => {
  it("name 模糊匹配（不区分大小写）", () => {
    const a = makeArchive({ id: "a", name: "红发火焰法师", description: "" });
    const b = makeArchive({ id: "b", name: "蓝发冰霜剑士", description: "" });
    const out = queryCharacterArchives([a, b], {
      projectId: "proj-A",
      searchName: "火焰",
    });
    expect(out.map((x) => x.id)).toEqual(["a"]);
  });

  it("description 也参与搜索", () => {
    const a = makeArchive({ id: "a", name: "角色A", description: "火焰系" });
    const b = makeArchive({ id: "b", name: "角色B", description: "冰霜系" });
    const out = queryCharacterArchives([a, b], {
      projectId: "proj-A",
      searchName: "冰霜",
    });
    expect(out.map((x) => x.id)).toEqual(["b"]);
  });

  it("空搜索串不过滤", () => {
    const a = makeArchive({ id: "a" });
    const b = makeArchive({ id: "b" });
    const out = queryCharacterArchives([a, b], { projectId: "proj-A", searchName: "" });
    expect(out.length).toBe(2);
  });
});

describe("aggregateAllTags", () => {
  it("聚合 + 按使用次数降序", () => {
    const archives = [
      makeArchive({ id: "1", tags: ["火焰", "法师"] }),
      makeArchive({ id: "2", tags: ["火焰", "战士"] }),
      makeArchive({ id: "3", tags: ["法师"] }),
    ];
    const out = aggregateAllTags(archives);
    // 火焰=2, 法师=2, 战士=1 → 火焰法师并列按字母序
    expect(out.slice(0, 2).sort()).toEqual(["法师", "火焰"]);
    expect(out[2]).toBe("战士");
  });

  it("空 tags 被忽略", () => {
    const archives = [
      makeArchive({ id: "1", tags: ["", "  ", "火焰"] }),
    ];
    const out = aggregateAllTags(archives);
    expect(out).toEqual(["火焰"]);
  });

  it("空 archives 返回空数组", () => {
    expect(aggregateAllTags([])).toEqual([]);
  });

  // M3.6 兜底:即便 Rust 端 schema 错配把 a.tags 发成 undefined,也不能 throw
  it("a.tags 不是数组时安全跳过(不 throw)", () => {
    const archives = [
      // 模拟 IPC 错误:tags 字段是 undefined(老数据 / 错配)
      { ...makeArchive({ id: "1" }), tags: undefined as unknown as string[] },
      makeArchive({ id: "2", tags: ["火焰"] }),
    ];
    // 不 throw 就行
    const out = aggregateAllTags(archives as Parameters<typeof aggregateAllTags>[0]);
    expect(out).toEqual(["火焰"]);
  });
});

describe("validateArchiveUpsert", () => {
  const validUpsert: CharacterArchiveUpsert = {
    scope: "project",
    projectId: "proj-A",
    name: "红发火焰法师",
    description: "20 岁女性",
    referenceImageAssetIds: ["asset-1"],
    styleContractId: null,
    promptSnippet: "",
    tags: ["火焰"],
    agentUseCount: 0,
  };

  it("合法输入返回 null", () => {
    expect(validateArchiveUpsert(validUpsert)).toBeNull();
  });

  it("name 为空报错", () => {
    expect(validateArchiveUpsert({ ...validUpsert, name: "  " })).toMatch(/档案名不能为空/);
  });

  it("name 超长报错", () => {
    expect(
      validateArchiveUpsert({ ...validUpsert, name: "a".repeat(101) }),
    ).toMatch(/不能超过 100 字符/);
  });

  it("scope=project 缺 projectId 报错", () => {
    expect(
      validateArchiveUpsert({ ...validUpsert, scope: "project", projectId: "" }),
    ).toMatch(/scope=project.*projectId/);
  });

  it("scope=global 带 projectId 报错", () => {
    expect(
      validateArchiveUpsert({ ...validUpsert, scope: "global", projectId: "x" }),
    ).toMatch(/scope=global.*必须为空/);
  });

  it("scope 非法值报错", () => {
    expect(
      validateArchiveUpsert({
        ...validUpsert,
        scope: "wrong" as unknown as "project",
      }),
    ).toMatch(/scope 必须是/);
  });

  it("参考图超过 6 张报错", () => {
    expect(
      validateArchiveUpsert({
        ...validUpsert,
        referenceImageAssetIds: ["a", "b", "c", "d", "e", "f", "g"],
      }),
    ).toMatch(/参考图最多 6 张/);
  });

  it("参考图 ID 重复报错", () => {
    expect(
      validateArchiveUpsert({
        ...validUpsert,
        referenceImageAssetIds: ["a", "b", "a"],
      }),
    ).toMatch(/参考图 ID 重复/);
  });

  it("tags 超过 16 个报错", () => {
    expect(
      validateArchiveUpsert({
        ...validUpsert,
        tags: Array.from({ length: 17 }, (_, i) => `tag-${i}`),
      }),
    ).toMatch(/标签最多 16 个/);
  });

  it("tag 为空报错", () => {
    expect(
      validateArchiveUpsert({ ...validUpsert, tags: ["火焰", "  "] }),
    ).toMatch(/标签不能为空/);
  });

  it("tag 超长报错", () => {
    expect(
      validateArchiveUpsert({ ...validUpsert, tags: ["a".repeat(25)] }),
    ).toMatch(/单个标签不能超过 24 字符/);
  });

  it("tag 重复报错", () => {
    expect(
      validateArchiveUpsert({ ...validUpsert, tags: ["火焰", "火焰"] }),
    ).toMatch(/标签重复/);
  });

  it("description 超长报错", () => {
    expect(
      validateArchiveUpsert({
        ...validUpsert,
        description: "a".repeat(4001),
      }),
    ).toMatch(/描述不能超过/);
  });

  it("promptSnippet 超长报错", () => {
    expect(
      validateArchiveUpsert({
        ...validUpsert,
        promptSnippet: "a".repeat(2001),
      }),
    ).toMatch(/Prompt 片段不能超过/);
  });
});

describe("makeEmptyArchive", () => {
  it("scope=project 时 projectId 用入参", () => {
    const out = makeEmptyArchive("project", "proj-A");
    expect(out.scope).toBe("project");
    expect(out.projectId).toBe("proj-A");
    expect(out.name).toBe("");
    expect(out.referenceImageAssetIds).toEqual([]);
    expect(out.tags).toEqual([]);
  });

  it("scope=global 时 projectId 强制为 null", () => {
    const out = makeEmptyArchive("global", "proj-A");
    expect(out.scope).toBe("global");
    expect(out.projectId).toBeNull();
  });
});

describe("isReferencedAsReference / findArchivesReferencingAsset", () => {
  it("正确识别 referenceImageAssetIds 命中", () => {
    const a = makeArchive({ id: "a", referenceImageAssetIds: ["x", "y"] });
    expect(isReferencedAsReference(a, "x")).toBe(true);
    expect(isReferencedAsReference(a, "z")).toBe(false);
  });

  it("findArchivesReferencingAsset 过滤出命中项", () => {
    const a = makeArchive({ id: "a", referenceImageAssetIds: ["x"] });
    const b = makeArchive({ id: "b", referenceImageAssetIds: ["y"] });
    const c = makeArchive({ id: "c", referenceImageAssetIds: ["x", "y"] });
    const out = findArchivesReferencingAsset([a, b, c], "x");
    expect(out.map((x) => x.id).sort()).toEqual(["a", "c"]);
  });
});

describe("summarizeArchivesForPrompt", () => {
  it("空数组返回空字符串", () => {
    expect(summarizeArchivesForPrompt([])).toBe("");
  });

  it("格式为 '- id | name (description[:60])'", () => {
    const a = makeArchive({
      id: "id-1",
      name: "小红",
      description: "20 岁火焰法师",
    });
    const out = summarizeArchivesForPrompt([a]);
    expect(out).toContain("id-1");
    expect(out).toContain("小红");
    expect(out).toContain("20 岁火焰法师");
  });

  it("超过 maxChars 时截断 + 提示", () => {
    const archives = Array.from({ length: 50 }, (_, i) =>
      makeArchive({ id: `id-${i.toString().padStart(3, "0")}`, name: `角色 ${i}` }),
    );
    const out = summarizeArchivesForPrompt(archives, 200);
    expect(out).toMatch(/已截断/);
    expect(out.length).toBeLessThan(300);
  });
});

describe("CHARACTER_ARCHIVE_LIMITS", () => {
  it("硬约束与 Rust 端 validate_archive_input 一致", () => {
    expect(CHARACTER_ARCHIVE_LIMITS.MAX_NAME_LENGTH).toBe(100);
    expect(CHARACTER_ARCHIVE_LIMITS.MAX_REFERENCE_IMAGES).toBe(6);
    expect(CHARACTER_ARCHIVE_LIMITS.MAX_TAGS).toBe(16);
  });
});

describe("renderCharacterArchive", () => {
  it("全空档案返回空串（不污染 prompt）", () => {
    const a = makeArchive({
      name: "",
      description: "",
      referenceImageAssetIds: [],
      promptSnippet: "",
    });
    expect(renderCharacterArchive(a)).toBe("");
  });

  it("有 name 时输出 [角色档案] 段", () => {
    const a = makeArchive({
      name: "红发火焰法师",
      description: "",
      referenceImageAssetIds: [],
      promptSnippet: "",
    });
    const out = renderCharacterArchive(a);
    expect(out).toContain("[角色档案]");
    expect(out).toContain("名称：红发火焰法师");
    expect(out).not.toContain("描述：");
  });

  it("name + description 完整输出", () => {
    const a = makeArchive({
      name: "红发火焰法师",
      description: "20 岁女性，火焰系魔法",
    });
    const out = renderCharacterArchive(a);
    expect(out).toContain("名称：红发火焰法师");
    expect(out).toContain("描述：20 岁女性，火焰系魔法");
  });

  it("参考图 N 张走单行说明", () => {
    const a = makeArchive({
      name: "X",
      referenceImageAssetIds: ["a", "b", "c"],
    });
    const out = renderCharacterArchive(a);
    expect(out).toContain("参考图：3 张");
    expect(out).toContain("image[] 数组里");
  });

  it("promptSnippet 单独成段，加 [用户补充] 前缀", () => {
    const a = makeArchive({
      name: "X",
      description: "desc",
      promptSnippet: "表情要夸张",
    });
    const out = renderCharacterArchive(a);
    expect(out).toContain("[用户补充] 表情要夸张");
    // snippet 应该是最后一段
    const lines = out.split("\n");
    expect(lines[lines.length - 1]).toBe("[用户补充] 表情要夸张");
  });

  it("空 name / description 字段不输出该行", () => {
    const a = makeArchive({
      name: "  ",
      description: "",
      referenceImageAssetIds: ["a"],
    });
    const out = renderCharacterArchive(a);
    expect(out).not.toContain("名称：");
    expect(out).not.toContain("描述：");
    expect(out).toContain("参考图：1 张");
  });

  it("空格-only name + 空格-only snippet 视为空", () => {
    const a = makeArchive({
      name: "   ",
      description: "desc",
      referenceImageAssetIds: [],
      promptSnippet: "  \n  ",
    });
    const out = renderCharacterArchive(a);
    expect(out).not.toContain("名称：");
    expect(out).not.toContain("[用户补充]");
    expect(out).toContain("描述：desc");
  });
});

describe("formatArchiveUpdated", () => {
  // 用 fake timer 锁住 Date.now() 避免边界 case 抖
  const NOW = 1_700_000_000_000;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("0 毫秒返回「—」", () => {
    expect(formatArchiveUpdated(0)).toBe("—");
  });

  it("< 1 分钟返回「刚刚」", () => {
    expect(formatArchiveUpdated(NOW - 30_000)).toBe("刚刚");
  });

  it("< 1 小时返回「N 分钟前」", () => {
    expect(formatArchiveUpdated(NOW - 5 * 60_000)).toBe("5 分钟前");
  });

  it("< 1 天返回「N 小时前」", () => {
    expect(formatArchiveUpdated(NOW - 3 * 3_600_000)).toBe("3 小时前");
  });

  it("< 7 天返回「N 天前」", () => {
    expect(formatArchiveUpdated(NOW - 2 * 86_400_000)).toBe("2 天前");
  });

  it(">= 7 天返回本地日期字符串", () => {
    const out = formatArchiveUpdated(NOW - 10 * 86_400_000);
    // zh-CN locale 的 toLocaleDateString 形如 "2023/9/28" 或 "2023-09-28"
    expect(out).toMatch(/\d{4}[/-]\d{1,2}[/-]\d{1,2}/);
  });
});
