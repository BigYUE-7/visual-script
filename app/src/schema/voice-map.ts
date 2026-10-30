import { z } from "zod";
import { Id } from "./common";

/**
 * 字/词级对齐：时间相对段首（毫秒）。
 */
export const WordAlignment = z.object({
  /** 对齐文本（单个字或词） */
  text: z.string().min(1),
  /** 开始时间（相对段首，毫秒） */
  startMs: z.number().nonnegative(),
  /** 结束时间（相对段首，毫秒） */
  endMs: z.number().nonnegative(),
}).strict();

/**
 * 语音分段：对应导演稿的一段 narration。
 */
export const VoiceSegment = z.object({
  narrationId: Id,
  /** 剥离锚点后的文本哈希，用于检测文本是否变化 */
  textHash: z.string().regex(/^sha256:[a-f0-9]{64}$/, "textHash 必须是 sha256:... 格式"),
  /** 音频文件相对路径 */
  audioFile: z.string().min(1),
  /** 音频实测时长（毫秒） */
  durationMs: z.number().positive(),
  /** L2 字/词级对齐；缺对齐时为空数组 */
  alignment: z.array(WordAlignment).default([]),
}).strict();

/**
 * 语音资产：导演稿 → 分段 TTS 的产物。
 */
export const VoiceMap = z.object({
  version: z.literal(1),
  /** TTS provider 标识 */
  provider: z.string().min(1),
  segments: z.array(VoiceSegment),
}).strict();

export type VoiceMap = z.infer<typeof VoiceMap>;
export type VoiceSegment = z.infer<typeof VoiceSegment>;
export type WordAlignment = z.infer<typeof WordAlignment>;
