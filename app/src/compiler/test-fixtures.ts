import { isSpeakable } from "./anchors";
import { sha256OfText } from "./canonical-hash";
import { stripAnchors } from "./anchors";
import { DirectorScript } from "../schema/director";
import { VoiceMap, type WordAlignment } from "../schema/voice-map";

/** 构造导演稿（过 zod 解析，自动填充默认值）。 */
export function makeDirector(options: {
  narrations?: unknown[];
  elements?: unknown[];
  cues?: unknown[];
  fps?: number;
} = {}): DirectorScript {
  return DirectorScript.parse({
    version: 1,
    meta: { title: "测试片", fps: options.fps ?? 30 },
    narrations: options.narrations ?? [
      {
        id: "n01",
        text: "植物也要吃饭，通过[[光合作用]]自己制造食物。",
        gapAfterMs: 300,
      },
      {
        id: "n02",
        text: "叶片里的[[叶绿体]]抓住阳光。",
        gapAfterMs: 0,
      },
    ],
    elements: options.elements ?? [
      {
        id: "kw",
        kind: "text",
        layer: 1,
        preset: "keyword",
        content: { type: "literal", text: "光合作用" },
      },
    ],
    cues: options.cues ?? [],
  });
}

/** 构造语音资产：按段给时长，可按文本自动生成逐字对齐。 */
export function makeVoiceMap(
  director: DirectorScript,
  durationsMs: Record<string, number>,
  options: { align?: boolean; msPerChar?: number } = {},
): VoiceMap {
  const { align = false, msPerChar = 200 } = options;
  return VoiceMap.parse({
    version: 1,
    provider: "test",
    segments: director.narrations.map((n) => ({
      narrationId: n.id,
      textHash: sha256OfText(stripAnchors(n.text)),
      audioFile: `audio/${n.id}.mp3`,
      durationMs: durationsMs[n.id] ?? 1000,
      alignment: align ? makeAlignment(stripAnchors(n.text), msPerChar) : [],
    })),
  });
}

/** 模拟 TTS 的逐字对齐（跳过标点，与 DashScope 实测一致）。 */
export function makeAlignment(plainText: string, msPerChar = 200): WordAlignment[] {
  const result: WordAlignment[] = [];
  let t = 0;
  for (const char of plainText) {
    if (!isSpeakable(char)) continue;
    result.push({ text: char, startMs: t, endMs: t + msPerChar });
    t += msPerChar;
  }
  return result;
}
