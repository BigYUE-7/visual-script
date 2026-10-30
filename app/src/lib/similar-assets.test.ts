import { describe, expect, it } from "vitest";
import type { LibraryAsset } from "../schema/library";
import { findSimilarAssets } from "./similar-assets";

const makeEntry = (
  id: string,
  overrides: Partial<LibraryAsset> = {},
): LibraryAsset => ({
  id,
  name: `素材${id}`,
  description: "测试素材",
  collection: "未分组",
  tags: [],
  file: `library/svg/${id}.svg`,
  viewBox: { width: 200, height: 200 },
  defaultWidth: 360,
  source: "ai",
  createdAt: "2026-10-08T00:00:00.000Z",
  ...overrides,
});

describe("findSimilarAssets", () => {
  const library = [
    makeEntry("mito", {
      name: "线粒体",
      description: "细胞的能量工厂，适合表达供能/转化",
      collection: "生物细胞",
      tags: ["生物", "细胞", "供能"],
    }),
    makeEntry("gear", {
      name: "齿轮",
      description: "机制与运转",
      collection: "科技图标",
      tags: ["图标", "机制"],
    }),
  ];

  it("名称命中 → 返回相似素材", () => {
    const found = findSimilarAssets("画一个线粒体的扁平示意图", library);
    expect(found.map((a) => a.id)).toContain("mito");
  });

  it("标签命中也可召回", () => {
    const found = findSimilarAssets("细胞里的能量结构，供能相关", library);
    expect(found.map((a) => a.id)).toContain("mito");
  });

  it("无关描述 → 空数组", () => {
    expect(findSimilarAssets("一只跳舞的兔子", library)).toEqual([]);
  });

  it("空描述 / 空库 → 空数组", () => {
    expect(findSimilarAssets("  ", library)).toEqual([]);
    expect(findSimilarAssets("线粒体", [])).toEqual([]);
  });
});
