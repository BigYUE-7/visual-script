import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { APP_ROOT } from "../config";
import { AnimationIR } from "../schema/animation-ir";
import { interpolateTransform } from "./interpolate";

describe("interpolateTransform", () => {
  it("没有关键帧的属性保持 initial", () => {
    const result = interpolateTransform(
      { x: 960, y: 540, scale: 1, rotation: 0, opacity: 1 },
      [{ frame: 0, transform: { opacity: 0 }, easing: "linear" }],
      90,
    );
    expect(result.x).toBe(960);
    expect(result.y).toBe(540);
    expect(result.opacity).toBe(0);
  });

  it("按关键帧插值并按缓动计算", () => {
    const result = interpolateTransform(
      { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
      [
        { frame: 0, transform: { x: 0 }, easing: "linear" },
        { frame: 10, transform: { x: 100 }, easing: "linear" },
      ],
      5,
    );
    expect(result.x).toBe(50);
  });

  it("AnimationIR.parse 不物化关键帧缺失字段（防默认值污染）", () => {
    const ir = AnimationIR.parse({
      version: 1,
      fps: 30,
      width: 1920,
      height: 1080,
      totalFrames: 10,
      assets: [],
      objects: [
        {
          id: "a",
          asset: "a",
          from: 0,
          durationInFrames: 10,
          layer: 0,
          initial: { x: 960, y: 540 },
          keyframes: [{ frame: 0, transform: { opacity: 0 } }],
        },
      ],
      audio: [],
    });
    expect(ir.objects[0].keyframes[0].transform).toEqual({ opacity: 0 });
  });

  it("真实 IR：frame 90 时 kw 仍在画布中心", () => {
    const ir = AnimationIR.parse(
      JSON.parse(
        readFileSync(
          join(APP_ROOT, "public", "workspaces", "demo", "ir.json"),
          "utf-8",
        ),
      ),
    );
    const kw = ir.objects.find((o) => o.id === "kw")!;
    const localFrame = 90 - kw.from;
    const transform = interpolateTransform(kw.initial, kw.keyframes, localFrame);
    expect(transform.x).toBe(960);
    expect(transform.y).toBe(540);
  });
});
