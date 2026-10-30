import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { stripAnchors } from "../compiler/anchors";
import { sha256OfText } from "../compiler/canonical-hash";
import { APP_ROOT } from "../config";
import { DirectorScript } from "../schema/director";
import { VoiceMap, type VoiceSegment } from "../schema/voice-map";
import { createDashscopeProvider } from "../tts/dashscope-provider";
import { createMockProvider } from "../tts/mock-provider";
import type { TTSProvider } from "../tts/tts-provider";
import { optionalString, parseArgs } from "./args";
import { isDirectRun } from "./run-guard";

/** 导演稿 → 分段语音 → VoiceMap（含缓存 / 过期检测）。 */
export async function runGenerateVoice(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  const workspace = optionalString(args, "workspace") ?? "demo";
  const providerKind = optionalString(args, "provider") ?? "dashscope";
  const force = args.force === true;

  const dir = join(APP_ROOT, "public", "workspaces", workspace);
  const directorPath =
    optionalString(args, "director") ?? join(dir, "director.json");
  if (!existsSync(directorPath)) {
    throw new Error(
      `未找到导演稿：${directorPath}\n可先生成：npm run director -- --topic "你的主题" --workspace ${workspace}`,
    );
  }

  const director = DirectorScript.parse(
    JSON.parse(readFileSync(directorPath, "utf-8")),
  );

  const audioDir = join(dir, "audio");
  mkdirSync(audioDir, { recursive: true });
  const mapPath = join(dir, "voice-map.json");

  let existing: VoiceMap | undefined;
  if (!force && existsSync(mapPath)) {
    try {
      existing = VoiceMap.parse(JSON.parse(readFileSync(mapPath, "utf-8")));
    } catch {
      console.warn("[voice] 现有 voice-map.json 无法解析，将全量重新生成");
    }
  }
  const existingByNarration = new Map(
    (existing?.segments ?? []).map((s) => [s.narrationId, s]),
  );

  const provider: TTSProvider =
    providerKind === "mock" ? createMockProvider() : createDashscopeProvider();
  console.log(`[voice] provider = ${provider.name}`);

  const segments: VoiceSegment[] = [];
  let reused = 0;
  let generated = 0;

  for (const narration of director.narrations) {
    const plainText = stripAnchors(narration.text);
    const textHash = sha256OfText(plainText);
    const previous = existingByNarration.get(narration.id);

    const sameProvider = existing?.provider === provider.name;
    if (
      previous &&
      sameProvider &&
      previous.textHash === textHash &&
      existsSync(join(dir, previous.audioFile))
    ) {
      segments.push(previous);
      reused += 1;
      console.log(`[voice] ${narration.id} 缓存命中（${(previous.durationMs / 1000).toFixed(2)}s）`);
      continue;
    }

    console.log(`[voice] ${narration.id} 合成中（${plainText.length} 字）...`);
    const result = await provider.synthesize(plainText);
    const audioFile = `audio/${narration.id}.${result.extension}`;
    writeFileSync(join(dir, audioFile), result.audio);
    generated += 1;

    segments.push({
      narrationId: narration.id,
      textHash,
      audioFile,
      durationMs: result.durationMs,
      alignment: result.alignment,
    });
    console.log(
      `[voice] ${narration.id} 完成：${(result.durationMs / 1000).toFixed(2)}s，对齐 ${result.alignment.length} 条`,
    );
  }

  const voiceMap = VoiceMap.parse({
    version: 1,
    provider: provider.name,
    segments,
  });
  writeFileSync(mapPath, JSON.stringify(voiceMap, null, 2) + "\n", "utf-8");

  console.log(`[voice] 已写入 ${mapPath}（复用 ${reused} 段，新生成 ${generated} 段）`);
  if (generated === 0) {
    console.log("[voice] 全部命中缓存；如需强制重录请加 --force");
  }
}

if (isDirectRun(import.meta.url)) {
  runGenerateVoice(process.argv.slice(2)).catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
