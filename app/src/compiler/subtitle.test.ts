import { describe, expect, it } from "vitest";
import { compileTimeline } from "./compile-timeline";
import { buildSubtitles } from "./subtitle";
import { makeDirector, makeVoiceMap } from "./test-fixtures";

function compile(
  director: ReturnType<typeof makeDirector>,
  voiceMap: ReturnType<typeof makeVoiceMap>,
) {
  const result = compileTimeline(director, voiceMap);
  if (!result.ok) {
    throw new Error("compile failed: " + JSON.stringify(result.issues));
  }
  return result.timedScript;
}

describe("buildSubtitles", () => {
  it("剥离锚点标记，按音频实测区间映射帧", () => {
    const director = makeDirector();
    const voiceMap = makeVoiceMap(director, { n01: 1000, n02: 1000 });

    const subtitles = buildSubtitles(director, compile(director, voiceMap));

    expect(subtitles).toHaveLength(2);
    expect(subtitles[0].narrationId).toBe("n01");
    expect(subtitles[0].text).toBe("植物也要吃饭，通过光合作用自己制造食物。");
    expect(subtitles[0].fromFrame).toBe(0);
    expect(subtitles[0].durationInFrames).toBe(30);

    // 第二段起点 = 1000ms 音频 + 300ms gap = 1300ms → 39 帧
    expect(subtitles[1].narrationId).toBe("n02");
    expect(subtitles[1].fromFrame).toBe(39);
  });

  it("使用 subtitle 预设（48/500）并给出测量行高", () => {
    const director = makeDirector();
    const voiceMap = makeVoiceMap(director, { n01: 3000, n02: 1000 });

    const cues = buildSubtitles(director, compile(director, voiceMap));

    expect(cues[0].fontSize).toBe(48);
    expect(cues[0].fontWeight).toBe(500);
    expect(cues[0].lineHeight).toBeGreaterThan(48);
    expect(cues[0].lines.length).toBeGreaterThan(0);
    expect(cues[0].lines.join("")).toBe(cues[0].text);
  });

  it("空段文本被跳过", () => {
    const director = makeDirector({
      narrations: [
        { id: "n01", text: " ", gapAfterMs: 0 },
        { id: "n02", text: "有内容。", gapAfterMs: 0 },
      ],
    });
    const voiceMap = makeVoiceMap(director, { n01: 500, n02: 500 });

    const cues = buildSubtitles(director, compile(director, voiceMap));
    expect(cues).toHaveLength(1);
    expect(cues[0].narrationId).toBe("n02");
  });
});
