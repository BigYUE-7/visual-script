import { copyFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { APP_ROOT } from "../config";
import { optionalString, parseArgs } from "./args";
import { runCompile } from "./compile";
import { runGenerateDirector } from "./generate-director";
import { runGenerateVoice } from "./generate-voice";
import { runRender } from "./render";
import { isDirectRun } from "./run-guard";

/**
 * 一键流水线：主题（或示例）→ 导演稿 → 语音 → 编译 → 渲染。
 *
 * 用法：
 *   npm run pipeline -- --topic "为什么天空是蓝色的" --workspace sky
 *   npm run pipeline -- --example --workspace demo          # 离线示例
 *   npm run pipeline -- --example --provider mock           # 完全离线（静音）
 */
export async function runPipeline(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  const workspace = optionalString(args, "workspace") ?? "demo";
  const provider = optionalString(args, "provider") ?? "dashscope";
  const topic = optionalString(args, "topic");
  const title = optionalString(args, "title");
  const useExample = args.example === true || !topic;

  const dir = join(APP_ROOT, "public", "workspaces", workspace);
  mkdirSync(dir, { recursive: true });
  const directorPath = join(dir, "director.json");

  if (useExample) {
    copyFileSync(
      join(APP_ROOT, "examples", "photosynthesis.director.json"),
      directorPath,
    );
    console.log(`[pipeline] 使用内置示例导演稿 → ${directorPath}`);
  } else {
    const directorArgs = ["--topic", topic!, "--workspace", workspace];
    if (title) directorArgs.push("--title", title);
    await runGenerateDirector(directorArgs);
  }

  await runGenerateVoice(["--workspace", workspace, "--provider", provider]);
  await runCompile(["--workspace", workspace]);
  await runRender(["--workspace", workspace]);

  console.log("[pipeline] 全流程完成");
}

if (isDirectRun(import.meta.url)) {
  runPipeline(process.argv.slice(2)).catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
