import { parseBuffer } from "music-metadata";
import { getProvider, loadTtsConfig } from "../config";
import type { WordAlignment } from "../schema/voice-map";
import { synthesizeWithDashscope } from "./dashscope-ws";
import type { SynthesizeResult, TTSProvider } from "./tts-provider";

/** 读取 config/tts.json 与 llm-api.json 的 dashscope 密钥，创建 provider。 */
export function createDashscopeProvider(): TTSProvider {
  const tts = loadTtsConfig();
  const { apiKey } = getProvider("dashscope");

  return {
    name: `dashscope:${tts.model}`,
    async synthesize(text: string): Promise<SynthesizeResult> {
      const format = tts.format ?? "mp3";
      const result = await synthesizeWithDashscope({
        apiKey,
        wsEndpoint: tts.wsEndpoint,
        model: tts.model,
        voice: tts.voice,
        text,
        format,
        sampleRate: tts.sampleRate,
      });

      if (result.audio.length === 0) {
        throw new Error("TTS 未返回音频数据");
      }

      // 时长一律以音频文件实测为准
      const meta = await parseBuffer(result.audio);
      const durationSec = meta.format.duration;
      if (!durationSec) {
        throw new Error("无法从音频文件解析出时长");
      }
      const durationMs = Math.round(durationSec * 1000);

      const alignment: WordAlignment[] = result.words.map((w) => ({
        text: w.text,
        startMs: w.beginMs,
        endMs: w.endMs,
      }));

      return {
        audio: result.audio,
        extension: format,
        durationMs,
        alignment,
      };
    },
  };
}
