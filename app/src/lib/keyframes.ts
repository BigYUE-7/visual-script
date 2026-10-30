import type {
  Keyframe,
  PartialTransform,
  SceneObject,
} from "../schema/animation-ir";

/** 可被关键帧驱动的变换属性（也是子轨道的划分依据）。 */
export type TransformProp = "x" | "y" | "scale" | "rotation" | "opacity";

export const TRANSFORM_PROPS: TransformProp[] = [
  "x",
  "y",
  "scale",
  "rotation",
  "opacity",
];

/**
 * 在指定帧插入/更新关键帧（编辑器与编译器共用的纯函数）。
 * - 同帧已存在：合并属性（新值覆盖旧值）；
 * - 否则插入并保持按 frame 升序。
 */
export function upsertKeyframe(
  keyframes: Keyframe[],
  frame: number,
  transform: PartialTransform,
  easing?: Keyframe["easing"],
): Keyframe[] {
  const next = keyframes.map((k) => ({
    frame: k.frame,
    transform: { ...k.transform },
    easing: k.easing,
  }));

  const existing = next.find((k) => k.frame === frame);
  if (existing) {
    existing.transform = { ...existing.transform, ...transform };
    if (easing) existing.easing = easing;
  } else {
    next.push({
      frame,
      transform: { ...transform },
      easing: easing ?? "linear",
    });
  }
  next.sort((a, b) => a.frame - b.frame);
  return next;
}

/** 删除指定帧的关键帧（同帧整帧删除）。 */
export function removeKeyframe(keyframes: Keyframe[], frame: number): Keyframe[] {
  return keyframes.filter((k) => k.frame !== frame);
}

/** 读取指定帧上的显式关键帧（无则 undefined）。 */
export function keyframeAtFrame(
  keyframes: Keyframe[],
  frame: number,
): Keyframe | undefined {
  return keyframes.find((k) => k.frame === frame);
}

/**
 * 移动"某个属性"的关键帧：fromFrame → toFrame。
 * - 源帧只移除该属性（同帧多份重复一并清除，归一化）；源帧若因此为空则整帧删除；
 * - 目标帧已有该属性则覆盖，否则合并/新建；
 * - 返回新的关键帧数组（不修改原数组）。
 */
export function movePropertyKeyframe(
  keyframes: Keyframe[],
  fromFrame: number,
  toFrame: number,
  property: TransformProp,
): Keyframe[] {
  if (fromFrame === toFrame) return keyframes;

  const hasSource = keyframes.some(
    (k) => k.frame === fromFrame && k.transform[property] !== undefined,
  );
  if (!hasSource) return keyframes;

  const source = keyframes.find(
    (k) => k.frame === fromFrame && k.transform[property] !== undefined,
  )!;
  const value = source.transform[property]!;
  const easing = source.easing;

  const next = keyframes.map((k) => ({
    frame: k.frame,
    transform: { ...k.transform },
    easing: k.easing,
  }));

  // 删除源帧上该属性的所有重复份（历史/异常数据归一化）
  for (const k of next) {
    if (k.frame === fromFrame) delete k.transform[property];
  }

  const cleaned = next.filter((k) => Object.keys(k.transform).length > 0);

  const target = cleaned.find((k) => k.frame === toFrame);
  if (target) {
    target.transform[property] = value;
  } else {
    const transform: PartialTransform = {};
    transform[property] = value;
    cleaned.push({ frame: toFrame, transform, easing });
  }

  cleaned.sort((a, b) => a.frame - b.frame);
  return cleaned;
}

/**
 * 关键帧拖动边界：该属性轨道上相邻关键帧之间可落点的闭区间。
 * - 上界 = 前一个关键帧 + 1（无则 0），下界 = 后一个关键帧 - 1（无则 maxFrame）；
 * - 保证拖动不越过相邻关键帧、不产生同帧重叠；
 * - 同帧重复（同属性）视作同一位置，一并排除。
 */
export function keyframeMoveBounds(
  keyframes: Keyframe[],
  frame: number,
  property: TransformProp,
  maxFrame: number,
): { minFrame: number; maxFrame: number } {
  const frames = keyframes
    .filter((k) => k.transform[property] !== undefined && k.frame !== frame)
    .map((k) => k.frame);
  const prev = frames.filter((f) => f < frame).sort((a, b) => b - a)[0];
  const next = frames.filter((f) => f > frame).sort((a, b) => a - b)[0];
  return {
    minFrame: Math.max(0, (prev ?? -1) + 1),
    maxFrame: Math.min(maxFrame, (next ?? maxFrame + 1) - 1),
  };
}

/** 修改某帧上"某个属性"的关键帧值（不存在则创建）。 */
export function setKeyframeValue(
  keyframes: Keyframe[],
  frame: number,
  property: TransformProp,
  value: number,
): Keyframe[] {
  const existing = keyframes.find((k) => k.frame === frame);
  const transform: PartialTransform = {};
  transform[property] = value;
  if (existing) {
    return keyframes.map((k) =>
      k.frame === frame
        ? { ...k, transform: { ...k.transform, ...transform } }
        : k,
    );
  }
  return upsertKeyframe(keyframes, frame, transform);
}

/** 修改某帧关键帧的缓动曲线（影响该帧到下一帧的插值）。 */
export function setKeyframeEasing(
  keyframes: Keyframe[],
  frame: number,
  easing: NonNullable<Keyframe["easing"]>,
): Keyframe[] {
  return keyframes.map((k) => (k.frame === frame ? { ...k, easing } : k));
}

/** 删除某帧上"某个属性"的关键帧（该帧若为空则整帧删除）。 */
export function removePropertyKeyframe(
  keyframes: Keyframe[],
  frame: number,
  property: TransformProp,
): Keyframe[] {
  return keyframes
    .map((k) =>
      k.frame === frame
        ? { frame: k.frame, transform: { ...k.transform }, easing: k.easing }
        : k,
    )
    .map((k) => {
      if (k.frame === frame) delete k.transform[property];
      return k;
    })
    .filter((k) => Object.keys(k.transform).length > 0);
}

/**
 * 在当前帧为对象写入部分变换（编辑器的"改参数即打关键帧"入口）。
 * 返回新的对象数据（不修改原对象）。
 */
export function applyTransformAtFrame(
  object: SceneObject,
  globalFrame: number,
  transform: PartialTransform,
  easing?: Keyframe["easing"],
): SceneObject {
  const localFrame = Math.max(0, globalFrame - object.from);
  const clampedLocal = Math.min(localFrame, object.durationInFrames - 1);
  return {
    ...object,
    keyframes: upsertKeyframe(
      object.keyframes,
      clampedLocal,
      transform,
      easing,
    ),
  };
}
