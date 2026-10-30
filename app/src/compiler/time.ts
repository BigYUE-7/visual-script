/** 毫秒 → 帧（显式取整，保证单调）。 */
export const msToFrames = (ms: number, fps: number): number =>
  Math.round((ms * fps) / 1000);
