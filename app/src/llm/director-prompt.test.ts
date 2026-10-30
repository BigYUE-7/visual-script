import { describe, expect, it } from "vitest";
import {
  buildDirectorSystemPrompt,
  injectAssetEnum,
  readDirectorJsonSchema,
} from "./director-prompt";

const assets = [
  { id: "mito", name: "线粒体", description: "细胞的能量工厂", tags: ["生物"] },
];

describe("director prompt 素材库注入", () => {
  it("有可用素材：schema 枚举 + 列表 + asset 元素说明", () => {
    const prompt = buildDirectorSystemPrompt({ assets });
    expect(prompt).toContain("【可用素材库】");
    expect(prompt).toContain("mito「线粒体」：细胞的能量工厂");
    expect(JSON.stringify(JSON.parse(injectAssetEnum(readDirectorJsonSchema(), ["mito"])))).toContain(
      '"enum":["mito"]',
    );
    expect(prompt).toContain('kind="asset"');
  });

  it("无可用素材：移除 asset 分支并省略列表", () => {
    const schema = JSON.parse(injectAssetEnum(readDirectorJsonSchema(), [])) as {
      properties: { elements: { items: { oneOf: { properties?: { kind?: { const?: string } } }[] } } };
    };
    const kinds = schema.properties.elements.items.oneOf.map(
      (o) => o.properties?.kind?.const,
    );
    expect(kinds).not.toContain("asset");

    const prompt = buildDirectorSystemPrompt({});
    expect(prompt).not.toContain("【可用素材库】");
  });
});
