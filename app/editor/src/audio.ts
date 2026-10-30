import type { AnimationIR } from "@app/schema/animation-ir";

/**
 * 编辑器音频预览：保持音频段与播放头同步。
 * - playing=true：进入区间时播放（带漂移校正）；离开区间暂停；
 * - playing=false：全部暂停。
 * 播放按钮应在用户手势内调用一次（绕过浏览器自动播放限制）。
 */
const elements = new Map<string, HTMLAudioElement>();

function getElement(file: string): HTMLAudioElement {
  let el = elements.get(file);
  if (!el) {
    el = new Audio(`/${file}`);
    el.preload = "auto";
    elements.set(file, el);
  }
  return el;
}

export function syncAudio(
  ir: AnimationIR,
  currentFrame: number,
  playing: boolean,
): void {
  const active = new Set<string>();

  for (const segment of ir.audio) {
    active.add(segment.file);
    const el = getElement(segment.file);
    const inRange =
      currentFrame >= segment.fromFrame &&
      currentFrame < segment.fromFrame + segment.durationInFrames;
    const expected = (currentFrame - segment.fromFrame) / ir.fps;

    if (playing && inRange) {
      if (el.paused) {
        if (Math.abs(el.currentTime - expected) > 0.25) {
          el.currentTime = Math.max(0, expected);
        }
        void el.play().catch(() => {});
      } else if (Math.abs(el.currentTime - expected) > 0.25) {
        el.currentTime = Math.max(0, expected);
      }
    } else if (!el.paused) {
      el.pause();
    }
  }

  // 清理已不在当前 IR 中的音频元素
  for (const [file, el] of elements) {
    if (!active.has(file)) {
      el.pause();
      elements.delete(file);
    }
  }
}

export function stopAllAudio(): void {
  for (const el of elements.values()) {
    el.pause();
  }
}
