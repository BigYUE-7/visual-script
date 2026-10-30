import { describe, expect, it } from "vitest";
import {
  ambientKeyframes,
  enterKeyframes,
  exitKeyframes,
} from "./animation-presets";

const base = { x: 960, y: 540, scale: 1, rotation: 0, opacity: 1 };

describe("animation-presets", () => {
  it("fade 入场：透明度 0 → 1", () => {
    const kfs = enterKeyframes("fade", base, 8, 80);
    expect(kfs[0].transform.opacity).toBe(0);
    expect(kfs[kfs.length - 1].transform.opacity).toBe(1);
  });

  it("pop 入场包含过冲缩放", () => {
    const kfs = enterKeyframes("pop", base, 10, 80);
    expect(kfs.some((k) => (k.transform.scale ?? 1) > 1)).toBe(true);
  });

  it("slide_up 从下方滑入并回到基准", () => {
    const kfs = enterKeyframes("slide_up", base, 8, 100);
    expect(kfs[0].transform.y).toBe(640);
    expect(kfs[1].transform.y).toBe(540);
  });

  it("shrink 退场缩小并透明", () => {
    const kfs = exitKeyframes("shrink", base, 8);
    expect(kfs[kfs.length - 1].transform.opacity).toBe(0);
    expect(kfs[kfs.length - 1].transform.scale).toBeCloseTo(0.85);
  });

  it("float 漂浮并回到基准位置", () => {
    const kfs = ambientKeyframes("float", base, 60);
    expect(kfs[0].transform.y).toBe(540);
    expect(kfs[kfs.length - 1].transform.y).toBe(540);
    expect(kfs.some((k) => k.transform.y === 524)).toBe(true);
  });

  it("shake 左右交替并回到基准", () => {
    const kfs = ambientKeyframes("shake", base, 600);
    const xs = kfs.map((k) => k.transform.x);
    expect(xs[0]).toBe(960 + 14);
    expect(xs[xs.length - 1]).toBe(960);
    expect(xs.some((x) => x === 946)).toBe(true);
  });

  it("wiggle 摆动旋转并回到基准", () => {
    const kfs = ambientKeyframes("wiggle", base, 600);
    expect(kfs[0].transform.rotation).toBe(5);
    expect(kfs[kfs.length - 1].transform.rotation).toBe(0);
  });
});
