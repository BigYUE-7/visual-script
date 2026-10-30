import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { APP_ROOT } from "../config";
import { createDashscopeProvider } from "../tts/dashscope-provider";
import { createMockProvider } from "../tts/mock-provider";
import { optionalString, parseArgs } from "./args";

/**
 * 单段合成冒烟测试：验证密钥、endpoint、音色与字级时间戳。
 * 用法：npm run tts:test -- --text "测试文本" [--provider mock]
 */
async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const text =
    optionalString(args, "text") ??
    "植物通过光合作用把光能转化为化学能，这是自然界最重要的能量转换过程之一。";
  const providerKind = optionalString(args, "provider") ?? "dashscope";

  const provider =
    providerKind === "mock" ? createMockProvider() : createDashscopeProvider();
  console.log(`[tts:test] provider = ${provider.name}`);
  console.log(`[tts:test] 文本（${text.length} 字）：${text}`);

  const started = Date.now();
  const result = await provider.synthesize(text);
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);

  const dir = join(APP_ROOT, "public", "workspaces", "_tts-test");
  mkdirSync(dir, { recursive: true });
  const outPath = join(dir, `test.${result.extension}`);
  writeFileSync(outPath, result.audio);

  console.log(`[tts:test] 音频已保存：${outPath}`);
  console.log(`[tts:test] 实测时长：${(result.durationMs / 1000).toFixed(3)}s（耗时 ${elapsed}s）`);
  console.log(`[tts:test] 字级对齐条数：${result.alignment.length}`);

  if (result.alignment.length > 0) {
    const first = result.alignment[0];
    const last = result.alignment[result.alignment.length - 1];
    console.log(
      `[tts:test] 首个对齐：「${first.text}」${first.startMs}–${first.endMs}ms；` +
        `最后对齐：「${last.text}」${last.startMs}–${last.endMs}ms`,
    );
  } else if (providerKind !== "mock") {
    console.warn("[tts:test][warning] 未返回字级对齐，关键词同步将降级为段首（L0）");
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
