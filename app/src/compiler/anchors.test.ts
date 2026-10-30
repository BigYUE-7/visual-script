import { describe, expect, it } from "vitest";
import {
  findAnchor,
  findAnchorMatches,
  isSpeakable,
  parseAnchors,
  resolveAnchorTime,
  speakableIndexMap,
  stripAnchors,
} from "./anchors";
import { makeAlignment } from "./test-fixtures";

describe("parseAnchors", () => {
  it("解析基本锚点并剥离标记", () => {
    const parsed = parseAnchors("通过[[光合作用]]制造食物");
    expect(parsed.errors).toEqual([]);
    expect(parsed.plainText).toBe("通过光合作用制造食物");
    expect(parsed.anchors).toHaveLength(1);
    expect(parsed.anchors[0]).toMatchObject({
      text: "光合作用",
      charIndex: 2,
      occurrence: 1,
    });
  });

  it("支持显式 id 语法 [[id|文本]]", () => {
    const parsed = parseAnchors("看[[p1|光合作用]]");
    expect(parsed.anchors[0].id).toBe("p1");
    expect(parsed.anchors[0].text).toBe("光合作用");
  });

  it("重复文本按出现顺序编号", () => {
    const parsed = parseAnchors("[[光]]与[[光]]");
    expect(parsed.plainText).toBe("光与光");
    expect(parsed.anchors.map((a) => a.occurrence)).toEqual([1, 2]);
  });

  it("未闭合标记报错且不丢失文本", () => {
    const parsed = parseAnchors("看[[光合作用");
    expect(parsed.errors.length).toBe(1);
    expect(parsed.plainText).toBe("看[[光合作用");
  });

  it("stripAnchors 仅剥离标记、保留锚点文字（文字要送 TTS）", () => {
    expect(stripAnchors("a[[锚]]b")).toBe("a锚b");
  });
});

describe("findAnchor", () => {
  it("按文本查找唯一锚点", () => {
    const parsed = parseAnchors("[[光]]与[[水]]");
    expect(findAnchor(parsed, "光")?.text).toBe("光");
    expect(findAnchor(parsed, "不存在")).toBeUndefined();
  });

  it("重复文本必须带 #N", () => {
    const parsed = parseAnchors("[[光]]与[[光]]");
    expect(findAnchor(parsed, "光")).toBeUndefined();
    expect(findAnchor(parsed, "光#2")?.occurrence).toBe(2);
    expect(findAnchorMatches(parsed, "光")).toHaveLength(2);
  });
});

describe("speakableIndexMap / resolveAnchorTime", () => {
  it("标点不可发声", () => {
    expect(isSpeakable("光")).toBe(true);
    expect(isSpeakable("，")).toBe(false);
    expect(isSpeakable(" ")).toBe(false);
    const map = speakableIndexMap("光，合");
    expect(map[0]).toBe(0);
    expect(map[1]).toBe(-1);
    expect(map[2]).toBe(1);
  });

  it("有对齐时命中锚点首字时间（L2）", () => {
    const parsed = parseAnchors("通过[[光合作用]]制造食物");
    const anchor = parsed.anchors[0];
    const alignment = makeAlignment(parsed.plainText, 200);
    const result = resolveAnchorTime({
      parsed,
      anchor,
      alignment,
      blockStartMs: 1000,
    });
    // "通过" 2 字 × 200ms = 400ms 后开始
    expect(result.precision).toBe("L2");
    expect(result.atMs).toBe(1400);
  });

  it("无对齐时降级为段首（L0）", () => {
    const parsed = parseAnchors("通过[[光合作用]]制造食物");
    const result = resolveAnchorTime({
      parsed,
      anchor: parsed.anchors[0],
      alignment: [],
      blockStartMs: 500,
    });
    expect(result.precision).toBe("L0");
    expect(result.atMs).toBe(500);
    expect(result.note).toBeTruthy();
  });

  it("对齐文本不匹配时降级并不崩溃", () => {
    const parsed = parseAnchors("12[[目标]]3");
    const alignment = makeAlignment("一二目标三", 200);
    const result = resolveAnchorTime({
      parsed,
      anchor: parsed.anchors[0],
      alignment,
      blockStartMs: 0,
    });
    // 前视重同步：跳过 "一"（对应数字 1 的额外读音）后命中 "目"
    expect(result.precision).toBe("L0");
  });
});
