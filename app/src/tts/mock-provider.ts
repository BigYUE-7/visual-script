import { isSpeakable } from "../compiler/anchors";
import type { SynthesizeResult, TTSProvider } from "./tts-provider";

/** 每字时长（mock 估算，仅用于离线自测） */
const MS_PER_CHAR = 170;
/** 段尾留白 */
const TAIL_MS = 400;
const SAMPLE_RATE = 22050;

/** 生成 16-bit PCM 单声道静音 WAV。 */
export function silentWav(durationMs: number, sampleRate = SAMPLE_RATE): Buffer {
  const samples = Math.max(1, Math.ceil((durationMs / 1000) * sampleRate));
  const dataSize = samples * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28); // byte rate
  buf.writeUInt16LE(2, 32); // block align
  buf.writeUInt16LE(16, 34); // bits per sample
  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);
  // 采样区保持 0（静音）
  return buf;
}

/**
 * 离线 mock provider：生成静音 WAV + 逐字对齐，
 * 用于不依赖 TTS 密钥的全链路自测。
 */
export function createMockProvider(): TTSProvider {
  return {
    name: "mock",
    async synthesize(text: string): Promise<SynthesizeResult> {
      const speakable = [...text].filter((c) => isSpeakable(c));
      const durationMs = speakable.length * MS_PER_CHAR + TAIL_MS;
      const alignment = speakable.map((char, i) => ({
        text: char,
        startMs: i * MS_PER_CHAR,
        endMs: (i + 1) * MS_PER_CHAR,
      }));
      return {
        audio: silentWav(durationMs),
        extension: "wav",
        durationMs,
        alignment,
      };
    },
  };
}
