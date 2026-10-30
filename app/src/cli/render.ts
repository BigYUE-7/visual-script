import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { APP_ROOT } from "../config";
import { AnimationIR } from "../schema/animation-ir";
import { optionalString, parseArgs } from "./args";
import { isDirectRun } from "./run-guard";

/**
 * 渲染：Animation IR → MP4（或单帧 PNG，用于抽帧检查）。
 * 用法：
 *   npm run render -- --workspace demo
 *   npm run render -- --workspace demo --still --frame 90 --out out/check.png
 */
export async function runRender(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  const workspace = optionalString(args, "workspace") ?? "demo";
  const dir = join(APP_ROOT, "public", "workspaces", workspace);
  const irPath = optionalString(args, "ir") ?? join(dir, "ir.json");
  const ir = AnimationIR.parse(JSON.parse(readFileSync(irPath, "utf-8")));

  const still = args.still === true;
  const frame = Number(optionalString(args, "frame") ?? "0") || 0;
  const out =
    optionalString(args, "out") ??
    (still
      ? join(APP_ROOT, "out", `${workspace}-frame${frame}.png`)
      : join(APP_ROOT, "out", `${workspace}.mp4`));

  const entryPoint = join(APP_ROOT, "src", "remotion", "index.ts");
  console.log("[render] 打包 Remotion bundle ...");
  const serveUrl = await bundle({
    entryPoint,
    publicDir: join(APP_ROOT, "public"),
  });

  const composition = await selectComposition({
    serveUrl,
    id: "VisualScript",
    inputProps: { ir },
  });
  console.log(
    `[render] ${composition.width}×${composition.height} @${composition.fps}fps，共 ${composition.durationInFrames} 帧`,
  );

  mkdirSync(dirname(out), { recursive: true });

  if (still) {
    await renderStill({
      composition,
      serveUrl,
      output: out,
      frame,
      inputProps: { ir },
    });
    console.log(`[render] 已输出单帧：${out}`);
    return;
  }

  console.log("[render] 开始渲染（首次运行会自动下载 Chrome Headless Shell）...");
  let lastReported = -1;
  await renderMedia({
    composition,
    serveUrl,
    codec: "h264",
    outputLocation: out,
    inputProps: { ir },
    onProgress: ({ progress }) => {
      const pct = Math.floor(progress * 100);
      if (pct >= lastReported + 10) {
        lastReported = pct;
        console.log(`[render] ${pct}%`);
      }
    },
  });
  console.log(`[render] 已输出视频：${out}`);
}

if (isDirectRun(import.meta.url)) {
  runRender(process.argv.slice(2)).catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
