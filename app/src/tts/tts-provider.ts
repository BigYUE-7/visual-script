import type { WordAlignment } from "../schema/voice-map";

/** 一次合成的结果。 */
export type SynthesizeResult = {
  audio: Buffer;
  /** 音频扩展名（mp3 / wav / pcm） */
  extension: string;
  /** 实测时长（毫秒）——由音频文件解析，不信任 TTS 响应里的估算 */
  durationMs: number;
  /** 字/词级对齐（相对段首）；无能力时为空数组 */
  alignment: WordAlignment[];
};

/**
 * TTS Provider 接口：应用只依赖此契约，便于替换云端/本地实现。
 */
export interface TTSProvider {
  /** 标识（写入 VoiceMap.provider） */
  readonly name: string;
  synthesize(text: string): Promise<SynthesizeResult>;
}
