import { z } from "zod";
import { Id } from "./common";

/**
 * 编译后的 cue：已经把锚点解析为绝对毫秒。
 */
export const TimedCue = z.object({
  id: Id,
  /** 触发时刻（相对全片起点，毫秒） */
  atMs: z.number().nonnegative(),
  /** 动作持续时长（毫秒） */
  durationMs: z.number().positive(),
}).strict();

/**
 * 编译后的口播块：包含绝对时间、音频区间、所含 cues。
 */
export const TimedBlock = z.object({
  narrationId: Id,
  /** 块开始时刻（毫秒） */
  startMs: z.number().nonnegative(),
  /** 块结束时刻（毫秒） */
  endMs: z.number().nonnegative(),
  /** 音频实际播放区间 */
  audio: z.object({
    file: z.string().min(1),
    startMs: z.number().nonnegative(),
    endMs: z.number().nonnegative(),
  }).strict(),
  cues: z.array(TimedCue),
}).strict();

/**
 * 源哈希：用于判断是否需要重新编译。
 */
export const SourceHash = z.object({
  director: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  voiceMap: z.string().regex(/^sha256:[a-f0-9]{64}$/),
}).strict();

/**
 * 时间脚本：由 DirectorScript + VoiceMap 链式推导出的绝对毫秒时间线。
 */
export const TimedScript = z.object({
  version: z.literal(1),
  fps: z.number().int().positive().default(30),
  sourceHash: SourceHash,
  blocks: z.array(TimedBlock),
  /** 全片总时长（毫秒） */
  totalMs: z.number().nonnegative(),
}).strict();

export type TimedScript = z.infer<typeof TimedScript>;
export type TimedBlock = z.infer<typeof TimedBlock>;
export type TimedCue = z.infer<typeof TimedCue>;
export type SourceHash = z.infer<typeof SourceHash>;
