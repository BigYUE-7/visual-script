import type { Keyframe, PartialTransform } from "../schema/animation-ir";

/** 动画基准状态（元素在该时刻的位置/变换）。 */
export type BaseTransform = {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
};

export type EnterPreset =
  | "fade"
  | "pop"
  | "slide_up"
  | "slide_down"
  | "slide_left"
  | "slide_right"
  | "zoom";
export type ExitPreset = "fade" | "shrink";
export type AmbientPreset = "float" | "shake" | "bounce" | "wiggle";

const KF = (
  frame: number,
  transform: PartialTransform,
  easing: Keyframe["easing"] = "linear",
): Keyframe => ({ frame, transform, easing });

/**
 * 入场关键帧（帧相对元素出场，0 → durationInFrames）。
 * 动画预设库：编译器与编辑器共用。
 */
export function enterKeyframes(
  preset: EnterPreset,
  base: BaseTransform,
  durationInFrames: number,
  distancePx: number,
): Keyframe[] {
  const d = Math.max(1, durationInFrames);
  switch (preset) {
    case "fade":
      return [KF(0, { opacity: 0 }), KF(d, { opacity: 1 })];
    case "pop":
      return [
        KF(0, { opacity: 0, scale: base.scale * 0.55 }, "ease-out"),
        KF(
          Math.round(d * 0.7),
          { opacity: 1, scale: base.scale * 1.08 },
          "ease-in-out",
        ),
        KF(d, { scale: base.scale }),
      ];
    case "slide_up":
      return [
        KF(0, { opacity: 0, y: base.y + distancePx }, "ease-out"),
        KF(d, { opacity: 1, y: base.y }),
      ];
    case "slide_down":
      return [
        KF(0, { opacity: 0, y: base.y - distancePx }, "ease-out"),
        KF(d, { opacity: 1, y: base.y }),
      ];
    case "slide_left":
      return [
        KF(0, { opacity: 0, x: base.x + distancePx }, "ease-out"),
        KF(d, { opacity: 1, x: base.x }),
      ];
    case "slide_right":
      return [
        KF(0, { opacity: 0, x: base.x - distancePx }, "ease-out"),
        KF(d, { opacity: 1, x: base.x }),
      ];
    case "zoom":
      return [
        KF(0, { opacity: 0, scale: base.scale * 1.35 }, "ease-out"),
        KF(d, { opacity: 1, scale: base.scale }),
      ];
  }
}

/** 退场关键帧（帧相对退场开始，0 → durationInFrames）。 */
export function exitKeyframes(
  preset: ExitPreset,
  base: BaseTransform,
  durationInFrames: number,
): Keyframe[] {
  const d = Math.max(1, durationInFrames);
  switch (preset) {
    case "fade":
      return [KF(0, { opacity: 1 }), KF(d, { opacity: 0 })];
    case "shrink":
      return [
        KF(0, { opacity: 1, scale: base.scale }, "ease-in"),
        KF(d, { opacity: 0, scale: base.scale * 0.85 }),
      ];
  }
}

/** 氛围动画关键帧（一次性播放，结束后回到基准状态）。 */
export function ambientKeyframes(
  preset: AmbientPreset,
  base: BaseTransform,
  durationInFrames: number,
): Keyframe[] {
  const d = Math.max(2, durationInFrames);
  switch (preset) {
    case "float": {
      const amplitude = 16;
      return [
        KF(0, { y: base.y }, "ease-in-out"),
        KF(Math.round(d * 0.25), { y: base.y - amplitude }, "ease-in-out"),
        KF(Math.round(d * 0.5), { y: base.y }, "ease-in-out"),
        KF(Math.round(d * 0.75), { y: base.y - amplitude }, "ease-in-out"),
        KF(d, { y: base.y }),
      ];
    }
    case "bounce": {
      const amplitude = 42;
      return [
        KF(0, { y: base.y }, "ease-out"),
        KF(Math.round(d * 0.35), { y: base.y - amplitude }, "ease-in"),
        KF(Math.round(d * 0.7), { y: base.y }, "ease-out"),
        KF(Math.round(d * 0.85), { y: base.y - amplitude * 0.4 }, "ease-in"),
        KF(d, { y: base.y }),
      ];
    }
    case "shake": {
      const steps = Math.min(12, Math.max(6, Math.round(d / 90)));
      const amplitude = 14;
      const keyframes: Keyframe[] = [];
      for (let i = 0; i < steps; i += 1) {
        keyframes.push(
          KF(Math.round((i * d) / steps), {
            x: base.x + (i % 2 === 0 ? amplitude : -amplitude),
          }),
        );
      }
      keyframes.push(KF(d, { x: base.x }));
      return keyframes;
    }
    case "wiggle": {
      const steps = Math.min(10, Math.max(6, Math.round(d / 120)));
      const amplitude = 5;
      const keyframes: Keyframe[] = [];
      for (let i = 0; i < steps; i += 1) {
        keyframes.push(
          KF(Math.round((i * d) / steps), {
            rotation: base.rotation + (i % 2 === 0 ? amplitude : -amplitude),
          }),
        );
      }
      keyframes.push(KF(d, { rotation: base.rotation }));
      return keyframes;
    }
  }
}
