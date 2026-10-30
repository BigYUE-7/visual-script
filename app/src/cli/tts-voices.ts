import { listVoices } from "../tts/dashscope-voices";
import { optionalString, parseArgs } from "./args";

/** 列出已克隆音色（找回 voice id 用）：npm run tts:voices [--prefix vsspike] */
async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const prefix = optionalString(args, "prefix");
  const voices = await listVoices(prefix);

  if (voices.length === 0) {
    console.log("没有查询到音色。请确认：dashscope 密钥已配置、业务空间 endpoint 正确。");
    return;
  }

  console.log(`${"voice_id".padEnd(30)} ${"status".padEnd(12)} gmt_create`);
  console.log("-".repeat(70));
  for (const voice of voices) {
    console.log(
      `${String(voice.voice_id ?? "-").padEnd(30)} ${String(voice.status ?? "-").padEnd(12)} ${voice.gmt_create ?? ""}`,
    );
  }
  console.log(`\n共 ${voices.length} 个音色。把需要的 voice_id 填入 config/tts.json 的 voice 字段。`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
