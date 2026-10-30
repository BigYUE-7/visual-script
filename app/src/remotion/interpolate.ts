import type { Keyframe, Transform } from "../schema/animation-ir";

export function applyEasing(t: number, easing: string): number {
  switch (easing) {
    case "ease-in":
      return t * t;
    case "ease-out":
      return 1 - (1 - t) * (1 - t);
    case "ease-in-out":
      return t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t);
    default:
      return t;
  }
}

const TRANSFORM_PROPS: (keyof Transform)[] = [
  "x",
  "y",
  "scale",
  "rotation",
  "opacity",
];

/**
 * 帧驱动插值：按属性各自的关键帧序列求值（纯函数）。
 * 某属性没有关键帧时使用 initial 值。
 */
export function interpolateTransform(
  initial: Transform,
  keyframes: Keyframe[],
  frame: number,
): Transform {
  const result: Transform = { ...initial };

  for (const prop of TRANSFORM_PROPS) {
    const kfs = keyframes.filter((k) => k.transform[prop] !== undefined);
    if (kfs.length === 0) continue;

    const first = kfs[0];
    const last = kfs[kfs.length - 1];

    if (frame <= first.frame) {
      result[prop] = first.transform[prop]!;
      continue;
    }
    if (frame >= last.frame) {
      result[prop] = last.transform[prop]!;
      continue;
    }

    for (let i = 0; i < kfs.length - 1; i += 1) {
      const a = kfs[i];
      const b = kfs[i + 1];
      if (frame >= a.frame && frame <= b.frame) {
        const span = b.frame - a.frame;
        const t = span === 0 ? 1 : (frame - a.frame) / span;
        const eased = applyEasing(t, a.easing ?? "linear");
        const from = a.transform[prop]!;
        const to = b.transform[prop]!;
        result[prop] = from + (to - from) * eased;
        break;
      }
    }
  }

  return result;
}
