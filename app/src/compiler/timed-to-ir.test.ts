import { describe, expect, it } from "vitest";
import { SUBTITLE_SAFE_ZONE } from "../theme/tokens";
import { compileTimeline } from "./compile-timeline";
import { CANVAS_HEIGHT } from "./layout";
import { timedToIr, msToFrames, INTRO_FRAMES, OUTRO_FRAMES } from "./timed-to-ir";
import { makeDirector, makeVoiceMap } from "./test-fixtures";

function compile(director: ReturnType<typeof makeDirector>, voiceMap: ReturnType<typeof makeVoiceMap>) {
  const result = compileTimeline(director, voiceMap);
  if (!result.ok) throw new Error("compile failed: " + JSON.stringify(result.issues));
  return result.timedScript;
}

describe("timedToIr", () => {
  it("appear 决定出场帧；无 disappear 则持续到片尾", () => {
    const director = makeDirector({
      cues: [
        {
          id: "c01",
          on: { narrationId: "n01", anchor: "光合作用" },
          action: { type: "appear", element: "kw" },
          durationMs: 300,
        },
      ],
    });
    const voiceMap = makeVoiceMap(director, { n01: 4000, n02: 1000 }, { align: true });
    const { ir } = timedToIr(director, voiceMap, compile(director, voiceMap), { bookends: false });

    const object = ir.objects.find((o) => o.id === "kw")!;
    expect(object.from).toBe(msToFrames(1600, 30)); // 锚点时刻 1600ms → 48 帧
    expect(object.from + object.durationInFrames).toBe(ir.totalFrames);
    // 淡入关键帧
    expect(object.keyframes[0]).toMatchObject({ frame: 0, transform: { opacity: 0 } });
  });

  it("文字资产含实测分行结果", () => {
    const director = makeDirector({
      cues: [
        {
          id: "c01",
          on: { narrationId: "n01", anchor: "光合作用" },
          action: { type: "appear", element: "kw" },
          durationMs: 300,
        },
      ],
    });
    const voiceMap = makeVoiceMap(director, { n01: 4000, n02: 1000 }, { align: true });
    const { ir } = timedToIr(director, voiceMap, compile(director, voiceMap), { bookends: false });

    const asset = ir.assets.find((a) => a.id === "kw")!;
    expect(asset.form).toBe("text");
    if (asset.form !== "text") return;
    expect(asset.text).toBe("光合作用");
    expect(asset.lines.length).toBe(1);
    expect(asset.bounds.width).toBeGreaterThan(0);
    expect(asset.anchors.center).toEqual({ x: 0.5, y: 0.5 });
  });

  it("emphasize 编译为三段缩放关键帧", () => {
    const director = makeDirector({
      cues: [
        {
          id: "c01",
          on: { narrationId: "n01", anchor: "光合作用" },
          action: { type: "appear", element: "kw" },
          durationMs: 300,
        },
        {
          id: "c02",
          on: { narrationId: "n01", anchor: "光合作用" },
          action: { type: "emphasize", element: "kw", scale: 1.5, easing: "ease-out" },
          durationMs: 1000,
        },
      ],
    });
    const voiceMap = makeVoiceMap(director, { n01: 4000, n02: 1000 }, { align: true });
    const { ir } = timedToIr(director, voiceMap, compile(director, voiceMap), { bookends: false });
    const object = ir.objects.find((o) => o.id === "kw")!;

    const scaleFrames = object.keyframes.filter((k) => k.transform.scale !== undefined);
    expect(scaleFrames.length).toBe(3);
    expect(scaleFrames[0].transform.scale).toBe(1);
    expect(scaleFrames[1].transform.scale).toBe(1.5);
    expect(scaleFrames[2].transform.scale).toBe(1);
    // 峰值在 40% 处
    const offset = scaleFrames[0].frame;
    expect(scaleFrames[1].frame - offset).toBe(Math.round(msToFrames(1000, 30) * 0.4));
  });

  it("move 移动到目标元素锚点（世界坐标）", () => {
    const director = makeDirector({
      elements: [
        {
          id: "kw",
          kind: "text",
          layer: 1,
          preset: "keyword",
          content: { type: "literal", text: "太阳" },
          slot: "center",
        },
        {
          id: "sun",
          kind: "shape",
          layer: 0,
          shape: "circle",
          color: "#FFD700",
          width: 400,
          height: 400,
          slot: "top_left",
        },
      ],
      cues: [
        {
          id: "c01",
          on: { narrationId: "n01", anchor: "光合作用" },
          action: { type: "appear", element: "kw" },
          durationMs: 300,
        },
        {
          id: "c02",
          on: { narrationId: "n01", anchor: "光合作用" },
          action: { type: "appear", element: "sun" },
          durationMs: 300,
        },
        {
          id: "c03",
          on: { narrationId: "n01", anchor: "光合作用" },
          action: { type: "move", element: "kw", to: "sun.center" },
          durationMs: 800,
        },
      ],
    });
    const voiceMap = makeVoiceMap(director, { n01: 4000, n02: 1000 }, { align: true });
    const { ir } = timedToIr(director, voiceMap, compile(director, voiceMap), { bookends: false });
    const object = ir.objects.find((o) => o.id === "kw")!;
    const moved = object.keyframes.filter((k) => k.transform.x !== undefined);
    expect(moved.length).toBe(2);
    // 目标：sun 位于 0.2×1920=384, 0.2×1080=216（circle 无尺寸偏移，center 锚点即中心）
    expect(moved[1].transform.x).toBe(384);
    expect(moved[1].transform.y).toBe(216);
    // 起点：kw 默认居中
    expect(moved[0].transform.x).toBe(960);
    expect(moved[0].transform.y).toBe(540);
  });

  it("文字绑定口播锚点 → 隐式出场 + 段尾退场", () => {
    const director = makeDirector({
      elements: [
        {
          id: "t02",
          kind: "text",
          layer: 1,
          preset: "keyword",
          content: { type: "narration", narrationId: "n01", anchor: "光合作用" },
        },
      ],
      cues: [],
    });
    const voiceMap = makeVoiceMap(director, { n01: 4000, n02: 1000 }, { align: true });
    const { ir } = timedToIr(director, voiceMap, compile(director, voiceMap), { bookends: false });

    const object = ir.objects.find((o) => o.id === "t02")!;
    expect(object).toBeTruthy();
    expect(object.from).toBe(msToFrames(1600, 30)); // 锚点时刻
    // 段尾 4000ms 退场 → 结束帧 = 120
    expect(object.from + object.durationInFrames).toBe(msToFrames(4000, 30));
    const asset = ir.assets.find((a) => a.id === "t02")!;
    if (asset.form === "text") {
      expect(asset.text).toBe("光合作用");
    }
  });

  it("没有任何出现 cue 的元素被跳过并给出 warning", () => {
    const director = makeDirector(); // kw 无 cue
    const voiceMap = makeVoiceMap(director, { n01: 1000, n02: 500 });
    const { ir, issues } = timedToIr(director, voiceMap, compile(director, voiceMap), { bookends: false });
    expect(ir.objects).toHaveLength(0);
    expect(issues.some((i) => i.code === "element-never-appears")).toBe(true);
  });

  it("appear preset pop 生成过冲缩放关键帧", () => {
    const director = makeDirector({
      cues: [
        {
          id: "c01",
          on: { narrationId: "n01", anchor: "光合作用" },
          action: { type: "appear", element: "kw", preset: "pop" },
          durationMs: 300,
        },
      ],
    });
    const voiceMap = makeVoiceMap(director, { n01: 4000, n02: 1000 }, { align: true });
    const { ir } = timedToIr(director, voiceMap, compile(director, voiceMap), { bookends: false });
    const object = ir.objects.find((o) => o.id === "kw")!;
    expect(object.keyframes.some((k) => (k.transform.scale ?? 1) > 1)).toBe(true);
  });

  it("animate shake 生成交替 x 关键帧（一次性播放）", () => {
    const director = makeDirector({
      cues: [
        {
          id: "c01",
          on: { narrationId: "n01", anchor: "光合作用" },
          action: { type: "appear", element: "kw" },
          durationMs: 300,
        },
        {
          id: "c02",
          on: { narrationId: "n01", anchor: "光合作用" },
          action: { type: "animate", element: "kw", preset: "shake" },
          durationMs: 600,
        },
      ],
    });
    const voiceMap = makeVoiceMap(director, { n01: 4000, n02: 1000 }, { align: true });
    const { ir } = timedToIr(director, voiceMap, compile(director, voiceMap), { bookends: false });
    const object = ir.objects.find((o) => o.id === "kw")!;
    const xFrames = object.keyframes.filter((k) => k.transform.x !== undefined);
    expect(xFrames.length).toBeGreaterThan(4);
    expect(xFrames[0].transform.x).toBe(960 + 14);
    expect(xFrames[xFrames.length - 1].transform.x).toBe(960);
  });

  it("disappear preset shrink 退场缩小", () => {
    const director = makeDirector({
      cues: [
        {
          id: "c01",
          on: { narrationId: "n01", anchor: "光合作用" },
          action: { type: "appear", element: "kw" },
          durationMs: 300,
        },
        {
          id: "c02",
          on: { narrationId: "n02", anchor: "叶绿体" },
          action: { type: "disappear", element: "kw", preset: "shrink" },
          durationMs: 300,
        },
      ],
    });
    const voiceMap = makeVoiceMap(director, { n01: 4000, n02: 1000 }, { align: true });
    const { ir } = timedToIr(director, voiceMap, compile(director, voiceMap), { bookends: false });
    const object = ir.objects.find((o) => o.id === "kw")!;
    expect(
      object.keyframes.some(
        (k) => k.transform.opacity === 0 && (k.transform.scale ?? 1) < 1,
      ),
    ).toBe(true);
  });

  it("音频段与 IR 帧对齐", () => {
    const director = makeDirector();
    const voiceMap = makeVoiceMap(director, { n01: 1000, n02: 500 });
    const { ir } = timedToIr(director, voiceMap, compile(director, voiceMap), { bookends: false });
    expect(ir.audio).toHaveLength(2);
    expect(ir.audio[0]).toMatchObject({ file: "audio/n01.mp3", fromFrame: 0, durationInFrames: 30 });
    expect(ir.audio[1].fromFrame).toBe(msToFrames(1300, 30));
    // 字幕随音频自动生成
    expect(ir.subtitles).toHaveLength(2);
    expect(ir.subtitles[0].fromFrame).toBe(0);
  });

  it("emoji 元素编译为内置文件资产（可参与通用 cue）", () => {
    const director = makeDirector({
      elements: [
        {
          id: "sun2",
          kind: "emoji",
          layer: 1,
          emoji: "sun",
          slot: "top_right",
        },
      ],
      cues: [
        {
          id: "c01",
          on: { narrationId: "n01", anchor: "光合作用" },
          action: { type: "appear", element: "sun2", preset: "pop" },
          durationMs: 300,
        },
      ],
    });
    const voiceMap = makeVoiceMap(director, { n01: 4000, n02: 1000 }, { align: true });
    const { ir } = timedToIr(director, voiceMap, compile(director, voiceMap), { bookends: false });

    const asset = ir.assets.find((a) => a.id === "sun2")!;
    expect(asset.form).toBe("emoji");
    if (asset.form !== "emoji") return;
    expect(asset.emoji).toBe("sun");
    expect(asset.file).toBe("twemoji/2600.svg");
    expect(asset.bounds).toEqual({ width: 220, height: 220 });
    expect(asset.anchors.center).toEqual({ x: 0.5, y: 0.5 });

    const object = ir.objects.find((o) => o.id === "sun2")!;
    expect(object.from).toBe(msToFrames(1600, 30));
  });
});

describe("片头尾卡与字幕安全区", () => {
  it("默认生成片头/片尾卡，内容、音频与字幕整体平移", () => {
    const director = makeDirector({
      cues: [
        {
          id: "c01",
          on: { narrationId: "n01", anchor: "光合作用" },
          action: { type: "appear", element: "kw" },
          durationMs: 300,
        },
      ],
    });
    const voiceMap = makeVoiceMap(director, { n01: 4000, n02: 1000 }, { align: true });
    const { ir } = timedToIr(director, voiceMap, compile(director, voiceMap));

    const intro = ir.objects.find((o) => o.id === "card-intro-title")!;
    expect(intro.from).toBe(0);
    expect(intro.durationInFrames).toBe(INTRO_FRAMES);
    expect(
      ir.assets.some((a) => a.id === "card-intro-title" && a.form === "text"),
    ).toBe(true);

    const kw = ir.objects.find((o) => o.id === "kw")!;
    expect(kw.from).toBe(INTRO_FRAMES + msToFrames(1600, 30));
    expect(kw.from + kw.durationInFrames).toBe(ir.totalFrames - OUTRO_FRAMES);

    const outro = ir.objects.find((o) => o.id === "card-outro-title")!;
    expect(outro.from).toBe(kw.from + kw.durationInFrames);
    expect(ir.assets.some((a) => a.id === "card-outro-note")).toBe(true);

    expect(ir.audio[0].fromFrame).toBe(INTRO_FRAMES);
    expect(ir.subtitles[0].fromFrame).toBe(INTRO_FRAMES);
  });

  it("bottom 槽元素被钳制到字幕安全区上方", () => {
    const director = makeDirector({
      elements: [
        {
          id: "note",
          kind: "text",
          layer: 1,
          preset: "keyword",
          content: { type: "literal", text: "晚霞" },
          slot: "bottom",
        },
      ],
      cues: [
        {
          id: "c01",
          on: { narrationId: "n01", anchor: "光合作用" },
          action: { type: "appear", element: "note" },
          durationMs: 300,
        },
      ],
    });
    const voiceMap = makeVoiceMap(director, { n01: 4000, n02: 1000 }, { align: true });
    const { ir } = timedToIr(director, voiceMap, compile(director, voiceMap), {
      bookends: false,
    });

    const object = ir.objects.find((o) => o.id === "note")!;
    const asset = ir.assets.find((a) => a.id === "note")!;
    if (asset.form !== "text") throw new Error("expected text asset");
    expect(object.initial.y + asset.bounds.height / 2).toBeLessThanOrEqual(
      CANVAS_HEIGHT - SUBTITLE_SAFE_ZONE + 1e-6,
    );
    expect(object.initial.y).toBeLessThan(0.84 * CANVAS_HEIGHT);
  });

  it("asset 元素经素材库解析为 SVG 资产（宽度可选覆盖）", () => {
    const director = makeDirector({
      elements: [
        {
          id: "mito1",
          kind: "asset",
          layer: 1,
          asset: "mito",
          slot: "top_left",
          width: 300,
        },
      ],
      cues: [
        {
          id: "c01",
          on: { narrationId: "n01", anchor: "光合作用" },
          action: { type: "appear", element: "mito1", preset: "pop" },
          durationMs: 300,
        },
      ],
    });
    const voiceMap = makeVoiceMap(director, { n01: 4000, n02: 1000 }, { align: true });
    const library = new Map([
      [
        "mito",
        {
          id: "mito",
          name: "线粒体",
          description: "细胞的能量工厂",
          collection: "生物细胞",
          tags: ["生物"],
          file: "library/svg/mito.svg",
          viewBox: { width: 200, height: 100 },
          defaultWidth: 360,
          source: "ai" as const,
          createdAt: "2026-10-08T00:00:00.000Z",
        },
      ],
    ]);
    const { ir, issues } = timedToIr(director, voiceMap, compile(director, voiceMap), {
      bookends: false,
      assetResolver: (id) => library.get(id),
    });

    const asset = ir.assets.find((a) => a.id === "mito1")!;
    expect(asset.form).toBe("svg");
    if (asset.form !== "svg") return;
    expect(asset.file).toBe("library/svg/mito.svg");
    // 宽度用元素覆盖值 300，高度按 viewBox 比例 → 150
    expect(asset.bounds).toEqual({ width: 300, height: 150 });
    expect(asset.anchors.center).toEqual({ x: 0.5, y: 0.5 });
    expect(ir.objects.some((o) => o.id === "mito1")).toBe(true);
    expect(issues.some((i) => i.code === "dangling-library-asset")).toBe(false);
  });

  it("asset 元素缺素材库条目 → error 并跳过", () => {
    const director = makeDirector({
      elements: [
        { id: "ghost", kind: "asset", layer: 1, asset: "nope" },
      ],
      cues: [
        {
          id: "c01",
          on: { narrationId: "n01", anchor: "光合作用" },
          action: { type: "appear", element: "ghost" },
          durationMs: 300,
        },
      ],
    });
    const voiceMap = makeVoiceMap(director, { n01: 1000, n02: 1000 });
    const { ir, issues } = timedToIr(director, voiceMap, compile(director, voiceMap), {
      bookends: false,
    });

    expect(ir.objects.some((o) => o.id === "ghost")).toBe(false);
    expect(
      issues.some(
        (i) => i.code === "dangling-library-asset" && i.severity === "error",
      ),
    ).toBe(true);
  });
});
