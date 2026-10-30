import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadAssetLibraryMap } from "../asset/library";
import { compileTimeline } from "../compiler/compile-timeline";
import { timedToIr } from "../compiler/timed-to-ir";
import { APP_ROOT } from "../config";
import { DirectorScript } from "../schema/director";
import { VoiceMap } from "../schema/voice-map";
import { optionalString, parseArgs } from "./args";
import { isDirectRun } from "./run-guard";

/**
 * 编译：导演稿 + VoiceMap → TimedScript → Animation IR。
 * 用法：npm run compile -- --workspace demo
 */
export async function runCompile(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  const workspace = optionalString(args, "workspace") ?? "demo";
  const dir = join(APP_ROOT, "public", "workspaces", workspace);
  const directorPath =
    optionalString(args, "director") ?? join(dir, "director.json");
  const voicePath =
    optionalString(args, "voice") ?? join(dir, "voice-map.json");

  const director = DirectorScript.parse(
    JSON.parse(readFileSync(directorPath, "utf-8")),
  );
  const voiceMap = VoiceMap.parse(
    JSON.parse(readFileSync(voicePath, "utf-8")),
  );

  const compiled = compileTimeline(director, voiceMap);
  for (const issue of compiled.issues) {
    console.log(`[compile][${issue.severity}] ${issue.message}`);
  }
  if (!compiled.ok) {
    throw new Error("编译失败：存在 error 级问题（见上方输出）");
  }

  const timedPath = join(dir, "timed-script.json");
  writeFileSync(
    timedPath,
    JSON.stringify(compiled.timedScript, null, 2) + "\n",
    "utf-8",
  );
  console.log(
    `[compile] 时间脚本 → ${timedPath}（${compiled.timedScript.blocks.length} 块，总时长 ${(compiled.timedScript.totalMs / 1000).toFixed(2)}s）`,
  );

  const library = loadAssetLibraryMap();
  const { ir, issues } = timedToIr(director, voiceMap, compiled.timedScript, {
    audioPrefix: `workspaces/${workspace}/`,
    assetResolver: (id) => library.get(id),
  });
  for (const issue of issues) {
    console.log(`[compile][${issue.severity}] ${issue.message}`);
  }

  const irPath = join(dir, "ir.json");
  writeFileSync(irPath, JSON.stringify(ir, null, 2) + "\n", "utf-8");
  console.log(
    `[compile] Animation IR → ${irPath}（${ir.assets.length} 资产 / ${ir.objects.length} 对象 / ${ir.totalFrames} 帧 @${ir.fps}fps）`,
  );
}

if (isDirectRun(import.meta.url)) {
  runCompile(process.argv.slice(2)).catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
