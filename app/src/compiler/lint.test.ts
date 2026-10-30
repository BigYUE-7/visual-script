import { describe, expect, it } from "vitest";
import { lintDirector } from "./lint";
import { makeDirector } from "./test-fixtures";

describe("lintDirector 素材库校验", () => {
  const withAsset = () =>
    makeDirector({
      elements: [
        { id: "mito1", kind: "asset", layer: 1, asset: "mito", slot: "center" },
      ],
      cues: [],
    });

  it("未提供库集合时跳过素材校验（示例/单测场景）", () => {
    const issues = lintDirector(withAsset()).filter(
      (i) => i.code === "dangling-library-asset",
    );
    expect(issues).toEqual([]);
  });

  it("引用库中不存在的资产 → error", () => {
    const issues = lintDirector(withAsset(), {
      libraryIds: new Set(["other"]),
    });
    expect(
      issues.some(
        (i) => i.code === "dangling-library-asset" && i.severity === "error",
      ),
    ).toBe(true);
  });

  it("引用已开放资产 → 无错误", () => {
    const issues = lintDirector(withAsset(), {
      libraryIds: new Set(["mito"]),
    });
    expect(issues.filter((i) => i.severity === "error")).toEqual([]);
  });
});
