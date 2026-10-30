import { describe, expect, it } from "vitest";
import { compileTimeline } from "./compile-timeline";
import { makeDirector, makeVoiceMap } from "./test-fixtures";

describe("compileTimeline 链式推导", () => {
  it("按 语音时长 + gapAfterMs 链式推导块时间", () => {
    const director = makeDirector();
    const voiceMap = makeVoiceMap(director, { n01: 1000, n02: 500 });
    const result = compileTimeline(director, voiceMap);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { blocks, totalMs, fps } = result.timedScript;
    expect(fps).toBe(30);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({ startMs: 0, endMs: 1000 });
    // n02 start = 1000 + 300(gap)
    expect(blocks[1]).toMatchObject({ startMs: 1300, endMs: 1800 });
    expect(totalMs).toBe(1800);
  });

  it("minHoldMs 让画面比语音长", () => {
    const director = makeDirector({
      narrations: [
        { id: "n01", text: "只有一段。", gapAfterMs: 0, minHoldMs: 3000 },
      ],
      elements: [],
      cues: [],
    });
    const voiceMap = makeVoiceMap(director, { n01: 800 });
    const result = compileTimeline(director, voiceMap);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.timedScript.blocks[0].endMs).toBe(3000);
    expect(result.timedScript.totalMs).toBe(3000);
  });

  it("有字级对齐时 cue.atMs 命中锚点字时刻", () => {
    const director = makeDirector({
      cues: [
        {
          id: "c01",
          on: { narrationId: "n01", anchor: "光合作用" },
          action: { type: "emphasize", element: "kw" },
          durationMs: 800,
        },
      ],
    });
    const voiceMap = makeVoiceMap(director, { n01: 4000, n02: 1000 }, { align: true });
    const result = compileTimeline(director, voiceMap);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // 锚点前有 8 个可发声字（植物也要吃饭通过）→ 8×200 = 1600ms
    expect(result.timedScript.blocks[0].cues[0].atMs).toBe(1600);
    expect(result.issues.some((i) => i.code === "anchor-l0")).toBe(false);
  });

  it("无对齐时 cue 降级为段首并给出 warning", () => {
    const director = makeDirector({
      cues: [
        {
          id: "c01",
          on: { narrationId: "n01", anchor: "光合作用" },
          action: { type: "emphasize", element: "kw" },
          durationMs: 800,
        },
      ],
    });
    const voiceMap = makeVoiceMap(director, { n01: 1000, n02: 500 });
    const result = compileTimeline(director, voiceMap);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.timedScript.blocks[0].cues[0].atMs).toBe(0);
    expect(result.issues.some((i) => i.code === "anchor-l0")).toBe(true);
  });

  it("源哈希稳定：相同输入 → 相同输出", () => {
    const director = makeDirector();
    const voiceMap = makeVoiceMap(director, { n01: 1000, n02: 500 });
    const a = compileTimeline(director, voiceMap);
    const b = compileTimeline(director, voiceMap);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.timedScript.sourceHash).toEqual(b.timedScript.sourceHash);
    expect(JSON.stringify(a.timedScript)).toBe(JSON.stringify(b.timedScript));
  });
});

describe("compileTimeline 错误路径", () => {
  it("悬空锚点 → 编译失败", () => {
    const director = makeDirector({
      cues: [
        {
          id: "c01",
          on: { narrationId: "n01", anchor: "不存在的词" },
          action: { type: "appear", element: "kw" },
          durationMs: 300,
        },
      ],
    });
    const voiceMap = makeVoiceMap(director, { n01: 1000, n02: 500 });
    const result = compileTimeline(director, voiceMap);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.some((i) => i.code === "dangling-anchor")).toBe(true);
  });

  it("缺少语音段 → 编译失败", () => {
    const director = makeDirector();
    const voiceMap = makeVoiceMap(director, { n01: 1000, n02: 500 });
    const trimmed = {
      ...voiceMap,
      segments: voiceMap.segments.filter((s) => s.narrationId !== "n02"),
    };
    const result = compileTimeline(director, trimmed);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.some((i) => i.code === "voice-missing")).toBe(true);
  });

  it("文本改动未重录 → warning 语音过期", () => {
    const director = makeDirector();
    const voiceMap = makeVoiceMap(director, { n01: 1000, n02: 500 });
    const edited = makeDirector({
      narrations: [
        { id: "n01", text: "改过的文案[[光合作用]]自己制造食物。", gapAfterMs: 300 },
        { id: "n02", text: "叶片里的[[叶绿体]]抓住阳光。", gapAfterMs: 0 },
      ],
    });
    const result = compileTimeline(edited, voiceMap);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.issues.some((i) => i.code === "voice-expired")).toBe(true);
  });
});
