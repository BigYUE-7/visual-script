import { defineConfig, type Plugin } from "vite";
import { spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import type { IncomingMessage } from "node:http";
import { join } from "node:path";
import { fileURLToPath, URL } from "node:url";
import {
  loadAssetLibrary,
  removeLibraryAsset,
  saveLibraryAsset,
  setLibraryAssetThumbnail,
  updateLibraryAssetMeta,
} from "../src/asset/library";
import { sanitizeSvg } from "../src/asset/svg-asset";

const appRoot = fileURLToPath(new URL("..", import.meta.url));
const publicDir = join(appRoot, "public");
const libraryRoot = join(publicDir, "library");
const tsxCli = join(appRoot, "node_modules", "tsx", "dist", "cli.mjs");

let generating = false;
let generatingAsset = false;

/** 读取 JSON 请求体（带大小上限）。 */
function readJsonBody(
  req: IncomingMessage,
  limit = 300_000,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk: Buffer) => {
      body += chunk;
      if (body.length > limit) {
        reject(new Error("请求体过大"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(new Error(`JSON 解析失败：${(err as Error).message}`));
      }
    });
    req.on("error", reject);
  });
}

/** 运行一个 CLI 步骤，逐行回调输出。 */
function runCliStep(
  script: string,
  args: string[],
  onLine: (line: string) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [tsxCli, join(appRoot, "src", "cli", script), ...args],
      {
        cwd: appRoot,
        env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
      },
    );
    const handle = (chunk: Buffer) => {
      for (const line of chunk.toString("utf-8").split(/\r?\n/)) {
        if (line.trim()) onLine(line);
      }
    };
    child.stdout.on("data", handle);
    child.stderr.on("data", handle);
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`${script} 退出码 ${code}（见上方日志）`)),
    );
  });
}

/** 运行 CLI 并捕获 stdout（用于返回 JSON 结果）。 */
function runCliCapture(script: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [tsxCli, join(appRoot, "src", "cli", script), ...args],
      {
        cwd: appRoot,
        env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
      },
    );
    let out = "";
    let err = "";
    child.stdout.on("data", (chunk: Buffer) => (out += chunk.toString("utf-8")));
    child.stderr.on("data", (chunk: Buffer) => (err += chunk.toString("utf-8")));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(out.trim());
      } else {
        const tail = err.trim().split(/\r?\n/).slice(-3).join("\n");
        reject(new Error(tail || `${script} 退出码 ${code}`));
      }
    });
  });
}

/**
 * 开发期小后端：
 * - GET  /api/workspaces  列出 public/workspaces 下的工作区
 * - POST /api/save?workspace=xx  把编辑器中的 IR 写回 ir.json
 * - GET  /api/generate?topic=..&workspace=..  运行 AI 流水线（SSE 流式日志）
 * - GET  /api/generate-asset?description=..  元素描述 → LLM 写 SVG（返回 JSON，预览用）
 * - GET  /api/library  素材库列表（public/library/index.json）
 * - POST /api/save-asset  接受素材：消毒后入素材库（名称/介绍/标签/默认宽度）
 * - POST /api/update-asset  修改素材元数据；POST /api/delete-asset  删除素材
 * - POST /api/thumbnail  回填缩略图（浏览器渲染的小图 PNG）
 * - GET/POST /api/selection?workspace=..  生成可用集（allowlist）读写
 */
function editorApi(): Plugin {
  return {
    name: "vs-editor-api",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url ?? "/", "http://localhost");

        if (url.pathname === "/api/workspaces") {
          const dir = join(publicDir, "workspaces");
          const list = existsSync(dir)
            ? readdirSync(dir, { withFileTypes: true })
                .filter((d) => d.isDirectory() && !d.name.startsWith("_"))
                .map((d) => d.name)
                .sort()
            : [];
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(list));
          return;
        }

        if (url.pathname === "/api/save" && req.method === "POST") {
          const workspace = url.searchParams.get("workspace") ?? "";
          if (!/^[a-zA-Z0-9_-]+$/.test(workspace)) {
            res.statusCode = 400;
            res.end("非法工作区名");
            return;
          }
          let body = "";
          req.on("data", (chunk) => (body += chunk));
          req.on("end", () => {
            try {
              const parsed = JSON.parse(body) as { version?: number };
              if (!parsed || parsed.version !== 1) {
                throw new Error("不是合法的 Animation IR");
              }
              const dir = join(publicDir, "workspaces", workspace);
              mkdirSync(dir, { recursive: true });
              writeFileSync(
                join(dir, "ir.json"),
                JSON.stringify(parsed, null, 2) + "\n",
                "utf-8",
              );
              res.end("ok");
            } catch (err) {
              res.statusCode = 400;
              res.end(err instanceof Error ? err.message : String(err));
            }
          });
          return;
        }

        if (url.pathname === "/api/generate" && req.method === "GET") {
          const topic = url.searchParams.get("topic")?.trim() ?? "";
          const workspace = url.searchParams.get("workspace") ?? "";
          const provider = url.searchParams.get("provider") ?? "dashscope";
          const assets = url.searchParams.get("assets");
          if (!topic || !/^[a-zA-Z0-9_-]+$/.test(workspace)) {
            res.statusCode = 400;
            res.end("参数错误：需要 topic 与合法 workspace");
            return;
          }
          if (generating) {
            res.statusCode = 409;
            res.end("已有生成任务进行中，请稍候");
            return;
          }
          generating = true;

          res.writeHead(200, {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          });
          const send = (payload: unknown) =>
            res.write(`data: ${JSON.stringify(payload)}\n\n`);

          void (async () => {
            try {
              send({ line: "▶ [1/3] 导演稿生成（DeepSeek）…" });
              const directorArgs = ["--topic", topic, "--workspace", workspace];
              // assets 缺省 = 全部可用；none = 不使用素材库；否则为逗号分隔 id 列表
              if (assets !== null && assets !== "all") {
                directorArgs.push("--assets", assets === "" ? "none" : assets);
              }
              await runCliStep(
                "generate-director.ts",
                directorArgs,
                (line) => send({ line }),
              );
              send({ line: "▶ [2/3] 语音合成（CosyVoice）…" });
              await runCliStep(
                "generate-voice.ts",
                ["--workspace", workspace, "--provider", provider],
                (line) => send({ line }),
              );
              send({ line: "▶ [3/3] 时间编译 → Animation IR …" });
              await runCliStep(
                "compile.ts",
                ["--workspace", workspace],
                (line) => send({ line }),
              );
              send({ done: true });
            } catch (err) {
              send({
                error: err instanceof Error ? err.message : String(err),
              });
            } finally {
              generating = false;
              res.end();
            }
          })();
          return;
        }

        // 元素描述 → LLM 写 SVG（不落盘，返回 JSON 供预览）
        if (url.pathname === "/api/generate-asset" && req.method === "GET") {
          const description = url.searchParams.get("description")?.trim() ?? "";
          const provider = url.searchParams.get("provider") ?? "deepseek";
          if (!description || description.length > 500) {
            res.statusCode = 400;
            res.end("参数错误：需要 description（不超过 500 字）");
            return;
          }
          if (generatingAsset) {
            res.statusCode = 409;
            res.end("已有素材生成任务进行中，请稍候");
            return;
          }
          generatingAsset = true;
          void (async () => {
            try {
              const out = await runCliCapture("generate-asset.ts", [
                "--description",
                description,
                "--provider",
                provider,
                "--stdout",
              ]);
              const lastLine = out.split(/\r?\n/).filter(Boolean).pop() ?? "";
              const parsed = JSON.parse(lastLine) as {
                svg: string;
                viewBox: { width: number; height: number };
              };
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify(parsed));
            } catch (err) {
              res.statusCode = 500;
              res.end(err instanceof Error ? err.message : String(err));
            } finally {
              generatingAsset = false;
            }
          })();
          return;
        }

        // 素材库：列出全部条目
        if (url.pathname === "/api/library" && req.method === "GET") {
          try {
            const assets = loadAssetLibrary(libraryRoot);
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ version: 1, assets }));
          } catch (err) {
            res.statusCode = 500;
            res.end(err instanceof Error ? err.message : String(err));
          }
          return;
        }

        // 接受素材：二次消毒 → 写 library/svg/<id>.svg + 入库索引
        if (url.pathname === "/api/save-asset" && req.method === "POST") {
          void (async () => {
            try {
              const body = (await readJsonBody(req)) as {
                svg?: unknown;
                name?: unknown;
                description?: unknown;
                collection?: unknown;
                tags?: unknown;
                width?: unknown;
                generatorPrompt?: unknown;
                thumbnailPng?: unknown;
              };
              if (
                typeof body.svg !== "string" ||
                typeof body.name !== "string" ||
                body.name.trim() === "" ||
                typeof body.description !== "string" ||
                body.description.trim() === ""
              ) {
                throw new Error("参数错误：需要 svg / name / description");
              }
              const meta = sanitizeSvg(body.svg);
              const entry = saveLibraryAsset(
                {
                  svg: meta.svg,
                  id: `ai-${Date.now().toString(36)}`,
                  name: body.name.trim().slice(0, 24),
                  description: body.description.trim().slice(0, 120),
                  collection:
                    typeof body.collection === "string" &&
                    body.collection.trim()
                      ? body.collection.trim().slice(0, 24)
                      : "未分组",
                  tags: Array.isArray(body.tags)
                    ? body.tags
                        .filter(
                          (t): t is string =>
                            typeof t === "string" && t.trim() !== "",
                        )
                        .map((t) => t.trim().slice(0, 16))
                        .slice(0, 6)
                    : [],
                  viewBox: { width: meta.width, height: meta.height },
                  defaultWidth:
                    typeof body.width === "number" && body.width > 0
                      ? Math.round(body.width)
                      : 360,
                  source: "ai",
                  ...(typeof body.thumbnailPng === "string" &&
                  body.thumbnailPng.length > 0
                    ? { thumbnailPngBase64: body.thumbnailPng }
                    : {}),
                  ...(typeof body.generatorPrompt === "string" &&
                  body.generatorPrompt.trim()
                    ? {
                        generator: {
                          provider: "deepseek",
                          prompt: body.generatorPrompt.trim().slice(0, 500),
                        },
                      }
                    : {}),
                },
                { root: libraryRoot },
              );
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ ok: true, entry }));
            } catch (err) {
              res.statusCode = 400;
              res.end(err instanceof Error ? err.message : String(err));
            }
          })();
          return;
        }

        // 修改素材元数据（名称 / 介绍 / 标签）
        if (url.pathname === "/api/update-asset" && req.method === "POST") {
          void (async () => {
            try {
              const body = (await readJsonBody(req)) as {
                id?: unknown;
                name?: unknown;
                description?: unknown;
                collection?: unknown;
                tags?: unknown;
              };
              if (
                typeof body.id !== "string" ||
                !/^[a-z][a-z0-9-]*$/.test(body.id)
              ) {
                throw new Error("非法素材 id");
              }
              const patch: {
                name?: string;
                description?: string;
                collection?: string;
                tags?: string[];
              } = {};
              if (typeof body.name === "string" && body.name.trim()) {
                patch.name = body.name.trim().slice(0, 24);
              }
              if (typeof body.description === "string" && body.description.trim()) {
                patch.description = body.description.trim().slice(0, 120);
              }
              if (typeof body.collection === "string" && body.collection.trim()) {
                patch.collection = body.collection.trim().slice(0, 24);
              }
              if (Array.isArray(body.tags)) {
                patch.tags = body.tags
                  .filter(
                    (t): t is string => typeof t === "string" && t.trim() !== "",
                  )
                  .map((t) => t.trim().slice(0, 16))
                  .slice(0, 6);
              }
              const entry = updateLibraryAssetMeta(body.id, patch, {
                root: libraryRoot,
              });
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ ok: true, entry }));
            } catch (err) {
              res.statusCode = 400;
              res.end(err instanceof Error ? err.message : String(err));
            }
          })();
          return;
        }

        // 回填缩略图（CLI 生成的资产在编辑器打开素材库时补齐）
        if (url.pathname === "/api/thumbnail" && req.method === "POST") {
          void (async () => {
            try {
              const body = (await readJsonBody(req)) as {
                id?: unknown;
                thumbnailPng?: unknown;
              };
              if (
                typeof body.id !== "string" ||
                !/^[a-z][a-z0-9-]*$/.test(body.id) ||
                typeof body.thumbnailPng !== "string" ||
                body.thumbnailPng.length === 0
              ) {
                throw new Error("参数错误：需要 id 与 thumbnailPng");
              }
              const entry = setLibraryAssetThumbnail(body.id, body.thumbnailPng, {
                root: libraryRoot,
              });
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ ok: true, entry }));
            } catch (err) {
              res.statusCode = 400;
              res.end(err instanceof Error ? err.message : String(err));
            }
          })();
          return;
        }

        // 删除素材（索引 + 文件）
        if (url.pathname === "/api/delete-asset" && req.method === "POST") {
          void (async () => {
            try {
              const body = (await readJsonBody(req)) as { id?: unknown };
              if (
                typeof body.id !== "string" ||
                !/^[a-z][a-z0-9-]*$/.test(body.id)
              ) {
                throw new Error("非法素材 id");
              }
              const removed = removeLibraryAsset(body.id, {
                root: libraryRoot,
                deleteFile: true,
              });
              res.setHeader("Content-Type", "application/json");
              res.end(
                JSON.stringify({ ok: true, removedId: removed?.id ?? null }),
              );
            } catch (err) {
              res.statusCode = 400;
              res.end(err instanceof Error ? err.message : String(err));
            }
          })();
          return;
        }

        // 生成可用集（allowlist）持久化：workspaces/<ws>/asset-selection.json
        if (url.pathname === "/api/selection") {
          const workspace = url.searchParams.get("workspace") ?? "";
          if (!/^[a-zA-Z0-9_-]+$/.test(workspace)) {
            res.statusCode = 400;
            res.end("非法工作区名");
            return;
          }
          const file = join(
            publicDir,
            "workspaces",
            workspace,
            "asset-selection.json",
          );
          if (req.method === "GET") {
            let ids: string[] | null = null;
            if (existsSync(file)) {
              try {
                const parsed = JSON.parse(readFileSync(file, "utf-8")) as {
                  ids?: unknown;
                };
                ids = Array.isArray(parsed.ids)
                  ? parsed.ids.filter((i): i is string => typeof i === "string")
                  : null;
              } catch {
                ids = null;
              }
            }
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ version: 1, ids }));
            return;
          }
          if (req.method === "POST") {
            void (async () => {
              try {
                const body = (await readJsonBody(req)) as { ids?: unknown };
                const ids =
                  body.ids === null
                    ? null
                    : Array.isArray(body.ids)
                      ? body.ids.filter(
                          (i): i is string =>
                            typeof i === "string" &&
                            /^[a-z][a-z0-9-]*$/.test(i),
                        )
                      : null;
                mkdirSync(join(publicDir, "workspaces", workspace), {
                  recursive: true,
                });
                writeFileSync(
                  file,
                  JSON.stringify({ version: 1, ids }, null, 2) + "\n",
                  "utf-8",
                );
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ ok: true, ids }));
              } catch (err) {
                res.statusCode = 400;
                res.end(err instanceof Error ? err.message : String(err));
              }
            })();
            return;
          }
        }

        next();
      });
    },
  };
}

export default defineConfig({
  publicDir,
  resolve: {
    alias: {
      "@app": join(appRoot, "src"),
    },
  },
  server: {
    port: 5200,
    open: true,
    fs: { allow: [appRoot] },
  },
  plugins: [editorApi()],
});
