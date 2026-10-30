import { describe, expect, it } from "vitest";
import type { SceneObject } from "../schema/animation-ir";
import {
  applyTransformAtFrame,
  keyframeAtFrame,
  keyframeMoveBounds,
  movePropertyKeyframe,
  removeKeyframe,
  removePropertyKeyframe,
  setKeyframeEasing,
  setKeyframeValue,
  upsertKeyframe,
} from "./keyframes";

describe("keyframes 编辑工具", () => {
  it("插入关键帧并保持有序", () => {
    let kfs = upsertKeyframe([], 10, { x: 100 });
    kfs = upsertKeyframe(kfs, 0, { opacity: 0 });
    kfs = upsertKeyframe(kfs, 5, { scale: 1.2 });
    expect(kfs.map((k) => k.frame)).toEqual([0, 5, 10]);
  });

  it("同帧合并属性", () => {
    let kfs = upsertKeyframe([], 5, { x: 100 });
    kfs = upsertKeyframe(kfs, 5, { y: 200 });
    expect(kfs).toHaveLength(1);
    expect(kfs[0].transform).toEqual({ x: 100, y: 200 });
  });

  it("删除与读取指定帧", () => {
    const kfs = upsertKeyframe([], 5, { x: 1 });
    expect(keyframeAtFrame(kfs, 5)?.transform.x).toBe(1);
    expect(removeKeyframe(kfs, 5)).toHaveLength(0);
  });

  it("movePropertyKeyframe 只移动指定属性并保留其他属性", () => {
    const kfs = [
      { frame: 0, transform: { opacity: 0, scale: 0.5 }, easing: "linear" as const },
      { frame: 10, transform: { opacity: 1 }, easing: "linear" as const },
    ];
    const moved = movePropertyKeyframe(kfs, 0, 5, "scale");
    expect(moved.map((k) => k.frame)).toEqual([0, 5, 10]);
    expect(moved[0].transform).toEqual({ opacity: 0 });
    expect(moved[1].transform).toEqual({ scale: 0.5 });
  });

  it("movePropertyKeyframe 目标帧已有该属性时覆盖", () => {
    const kfs = [
      { frame: 0, transform: { x: 1 }, easing: "linear" as const },
      { frame: 10, transform: { x: 2 }, easing: "linear" as const },
    ];
    const moved = movePropertyKeyframe(kfs, 0, 10, "x");
    expect(moved).toHaveLength(1);
    expect(moved[0].transform.x).toBe(1);
  });

  it("movePropertyKeyframe 归一化同帧同属性重复（移动后只剩一份 x）", () => {
    const dup = [
      { frame: 5, transform: { x: 1, y: 9 }, easing: "linear" as const },
      { frame: 5, transform: { x: 2 }, easing: "linear" as const },
      { frame: 10, transform: { x: 3 }, easing: "linear" as const },
    ];
    const moved = movePropertyKeyframe(dup, 5, 7, "x");
    // 5 上只剩 y（x 已移走，空的第二份被丢弃）；7 上是移过来的 x
    expect(moved.map((k) => k.frame)).toEqual([5, 7, 10]);
    expect(moved.find((k) => k.frame === 5)?.transform).toEqual({ y: 9 });
    expect(moved.find((k) => k.frame === 7)?.transform.x).toBe(1);
    expect(moved.filter((k) => k.transform.x !== undefined)).toHaveLength(2);
  });

  it("keyframeMoveBounds 给出相邻关键帧之间的可落点区间（不越位）", () => {
    const kfs = [
      { frame: 0, transform: { x: 0 }, easing: "linear" as const },
      { frame: 10, transform: { x: 10 }, easing: "linear" as const },
      { frame: 30, transform: { x: 30 }, easing: "linear" as const },
    ];
    expect(keyframeMoveBounds(kfs, 10, "x", 100)).toEqual({
      minFrame: 1,
      maxFrame: 29,
    });
    // 该属性无邻居 → 对象全区间
    expect(keyframeMoveBounds(kfs, 10, "opacity", 100)).toEqual({
      minFrame: 0,
      maxFrame: 100,
    });
    // 末尾关键帧只受前邻约束
    expect(keyframeMoveBounds(kfs, 30, "x", 100)).toEqual({
      minFrame: 11,
      maxFrame: 100,
    });
    // 紧挨的关键帧 → 只能停在原地（区间收窄为单帧）
    const tight = [
      { frame: 4, transform: { x: 1 }, easing: "linear" as const },
      { frame: 5, transform: { x: 2 }, easing: "linear" as const },
      { frame: 6, transform: { x: 3 }, easing: "linear" as const },
    ];
    expect(keyframeMoveBounds(tight, 5, "x", 100)).toEqual({
      minFrame: 5,
      maxFrame: 5,
    });
    // 同帧重复视作同一位置（一并排除）
    const dup = [
      { frame: 5, transform: { x: 1 }, easing: "linear" as const },
      { frame: 5, transform: { x: 2 }, easing: "linear" as const },
      { frame: 9, transform: { x: 3 }, easing: "linear" as const },
    ];
    expect(keyframeMoveBounds(dup, 5, "x", 100)).toEqual({
      minFrame: 0,
      maxFrame: 8,
    });
  });

  it("removePropertyKeyframe 只删除指定属性", () => {
    const kfs = [
      { frame: 3, transform: { x: 1, opacity: 0.5 }, easing: "linear" as const },
    ];
    expect(removePropertyKeyframe(kfs, 3, "x")).toEqual([
      { frame: 3, transform: { opacity: 0.5 }, easing: "linear" },
    ]);
    expect(removePropertyKeyframe(kfs, 3, "opacity")[0].transform).toEqual({ x: 1 });
    expect(removePropertyKeyframe(kfs, 3, "x").length).toBe(1);
  });

  it("setKeyframeValue 修改/创建属性值", () => {
    const kfs = [{ frame: 5, transform: { x: 1 }, easing: "linear" as const }];
    expect(setKeyframeValue(kfs, 5, "y", 2)[0].transform).toEqual({
      x: 1,
      y: 2,
    });
    const created = setKeyframeValue(kfs, 9, "scale", 1.5);
    expect(created).toHaveLength(2);
    expect(created[1]).toMatchObject({ frame: 9, transform: { scale: 1.5 } });
  });

  it("setKeyframeEasing 修改缓动", () => {
    const kfs = [{ frame: 5, transform: { x: 1 }, easing: "linear" as const }];
    expect(setKeyframeEasing(kfs, 5, "ease-in-out")[0].easing).toBe(
      "ease-in-out",
    );
  });

  it("applyTransformAtFrame 将全局帧换算为对象局部帧", () => {
    const object: SceneObject = {
      id: "a",
      asset: "a",
      from: 30,
      durationInFrames: 60,
      layer: 0,
      initial: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
      keyframes: [],
    };
    const updated = applyTransformAtFrame(object, 50, { x: 123 });
    expect(updated.keyframes[0].frame).toBe(20);
    // 早于出场：夹到 0
    const early = applyTransformAtFrame(object, 10, { x: 1 });
    expect(early.keyframes[0].frame).toBe(0);
  });
});
