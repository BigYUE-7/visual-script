import type { DirectorScript } from "../schema/director";
import type { TimedBlock, TimedCue, TimedScript } from "../schema/timed-script";
import type { VoiceMap, VoiceSegment } from "../schema/voice-map";
import { findAnchor, parseAnchors, resolveAnchorTime } from "./anchors";
import { sha256Of } from "./canonical-hash";
import { hasErrors, lintAll, type LintIssue } from "./lint";

export type CompileResult =
  | { ok: true; timedScript: TimedScript; issues: LintIssue[] }
  | { ok: false; issues: LintIssue[] };

/**
 * 导演稿 + 语音资产 → 时间脚本（纯函数）。
 *
 * 时间链式推导（唯一时间来源）：
 *   cursor = 0
 *   对每段口播：
 *     startMs  = cursor
 *     audioEnd = startMs + durationMs
 *     endMs    = max(audioEnd, startMs + minHoldMs)
 *     cursor   = endMs + gapAfterMs
 *   cue.atMs：有 L2 对齐取锚点首字时刻；否则降级为段首（记 warning）。
 *
 * 同一输入 → 同一输出；不读系统时间、不用随机数。
 */
export function compileTimeline(
  director: DirectorScript,
  voiceMap: VoiceMap,
): CompileResult {
  const issues = lintAll(director, voiceMap);
  if (hasErrors(issues)) {
    return { ok: false, issues };
  }

  const segments = new Map<string, VoiceSegment>(
    voiceMap.segments.map((s) => [s.narrationId, s]),
  );

  const blocks: TimedBlock[] = [];
  let cursor = 0;

  for (const narration of director.narrations) {
    const segment = segments.get(narration.id);
    if (!segment) {
      // lint 已报错，这里仅为类型收窄兜底
      return { ok: false, issues };
    }

    const startMs = cursor;
    const audioEndMs = startMs + segment.durationMs;
    const endMs = Math.max(audioEndMs, startMs + narration.minHoldMs);
    cursor = endMs + narration.gapAfterMs;

    const parsed = parseAnchors(narration.text);
    const cues: TimedCue[] = [];

    for (const cue of director.cues) {
      if (cue.on.narrationId !== narration.id) continue;
      const anchor = findAnchor(parsed, cue.on.anchor);
      if (!anchor) continue; // lint 已报错

      const resolved = resolveAnchorTime({
        parsed,
        anchor,
        alignment: segment.alignment,
        blockStartMs: startMs,
      });
      if (resolved.precision === "L0") {
        issues.push({
          severity: "warning",
          code: "anchor-l0",
          message: `cue ${cue.id}：锚点「${cue.on.anchor}」${resolved.note ?? "降级为段首"}`,
          path: `cues.${cue.id}`,
        });
      }
      cues.push({
        id: cue.id,
        atMs: resolved.atMs,
        durationMs: cue.durationMs,
      });
    }

    blocks.push({
      narrationId: narration.id,
      startMs,
      endMs,
      audio: {
        file: segment.audioFile,
        startMs,
        endMs: audioEndMs,
      },
      cues,
    });
  }

  const timedScript: TimedScript = {
    version: 1,
    fps: director.meta.fps,
    sourceHash: {
      director: sha256Of(director),
      voiceMap: sha256Of(voiceMap),
    },
    blocks,
    // 链式推导的最终游标（含最后一段的 gapAfterMs，作为片尾留白）
    totalMs: cursor,
  };

  return { ok: true, timedScript, issues };
}
