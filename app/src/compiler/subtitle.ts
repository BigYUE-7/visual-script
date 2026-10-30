import { measureText } from "../asset/measure-text";
import type { SubtitleCue } from "../schema/animation-ir";
import type { DirectorScript } from "../schema/director";
import type { TimedScript } from "../schema/timed-script";
import { TEXT_PRESETS } from "../theme/tokens";
import { stripAnchors } from "./anchors";
import { msToFrames } from "./time";

/** 字幕最大宽度（设计基准单位；超长自动换行）。 */
export const SUBTITLE_MAX_WIDTH = 1400;

/**
 * 时间脚本 → 整句字幕：
 * - 文本取口播原文（剥离 [[...]] 锚点标记）；
 * - 分行在编译期用内置字体测量，渲染端逐行摆放（跨机器确定性）；
 * - 时间取音频实测区间（不含 gapAfterMs 留白）。
 */
export function buildSubtitles(
  director: DirectorScript,
  timedScript: TimedScript,
): SubtitleCue[] {
  const narrationById = new Map(director.narrations.map((n) => [n.id, n]));
  const preset = TEXT_PRESETS.subtitle;
  const fps = timedScript.fps;

  const subtitles: SubtitleCue[] = [];
  for (const block of timedScript.blocks) {
    const narration = narrationById.get(block.narrationId);
    if (!narration) continue;
    const text = stripAnchors(narration.text).trim();
    if (!text) continue;

    const fromFrame = msToFrames(block.audio.startMs, fps);
    const endFrame = msToFrames(block.audio.endMs, fps);
    const measured = measureText(text, {
      fontSize: preset.fontSize,
      weight: preset.weight,
      maxWidth: SUBTITLE_MAX_WIDTH,
    });

    subtitles.push({
      narrationId: block.narrationId,
      text,
      lines: measured.lines,
      fontSize: preset.fontSize,
      fontWeight: preset.weight,
      lineHeight: measured.lineHeight,
      fromFrame,
      durationInFrames: Math.max(1, endFrame - fromFrame),
    });
  }
  return subtitles;
}
