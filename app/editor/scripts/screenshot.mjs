// 编辑器自动化截图（冒烟验证用）
// 用法：node editor/scripts/screenshot.mjs <帧号> [输出路径]
// 前置：npm run editor（开发服务器已在 5200 端口运行）
import { spawn } from "node:child_process";
import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = join(here, "..", "..");

const frame = Number(process.argv[2] ?? 400);
const out =
  process.argv[3] ?? join(appRoot, "out", `editor-frame${frame}.png`);
const workspace = process.argv[4];
const extraExpression = process.argv[5];

function findChrome() {
  const root = join(appRoot, "node_modules", ".remotion");
  if (!existsSync(root)) return null;
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop();
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.name === "chrome-headless-shell.exe") return full;
    }
  }
  return null;
}

const chromePath = findChrome();
if (!chromePath) {
  console.error("未找到 chrome-headless-shell，请先运行一次 npm run render");
  process.exit(1);
}

const port = 9333;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const chrome = spawn(
  chromePath,
  [
    `--remote-debugging-port=${port}`,
    "--disable-gpu",
    "--no-sandbox",
    "--hide-scrollbars",
    "--window-size=1680,1000",
    "http://localhost:5200/",
  ],
  { stdio: "ignore" },
);

async function getWsUrl() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const res = await fetch(`http://localhost:${port}/json`);
      const list = await res.json();
      const page = list.find((t) => t.type === "page");
      if (page) return page.webSocketDebuggerUrl;
    } catch {
      // 等待就绪
    }
    await sleep(500);
  }
  throw new Error("Chrome 未就绪");
}

const ws = new WebSocket(await getWsUrl());
let nextId = 0;
const pending = new Map();

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

ws.on("message", (data) => {
  const msg = JSON.parse(data.toString());
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(JSON.stringify(msg.error)));
    else resolve(msg.result);
  }
});

await new Promise((resolve) => ws.on("open", resolve));
await send("Page.enable");
await send("Runtime.enable");
await sleep(5000);

if (workspace) {
  await send("Runtime.evaluate", {
    expression: `window.__vsEditor.getState().loadWorkspace(${JSON.stringify(workspace)})`,
  });
  for (let i = 0; i < 20; i += 1) {
    const state = await send("Runtime.evaluate", {
      expression:
        'window.__vsEditor ? JSON.stringify({ ws: window.__vsEditor.getState().workspace, objects: window.__vsEditor.getState().ir?.objects.length ?? 0 }) : ""',
      returnByValue: true,
    });
    const raw = state.result?.value;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.ws === workspace && parsed.objects > 0) break;
    }
    await sleep(500);
  }
}

if (extraExpression) {
  await sleep(800); // 等待加载后的首次渲染
  const extra = await send("Runtime.evaluate", {
    expression: extraExpression,
    returnByValue: true,
  });
  if (extra.exceptionDetails) {
    console.log("extra exception:", JSON.stringify(extra.exceptionDetails));
  } else {
    console.log("extra:", extra.result?.value);
  }
  await sleep(700);
}

const result = await send("Runtime.evaluate", {
  expression: `window.__vsEditor ? (window.__vsEditor.getState().setFrame(${frame}), JSON.stringify({ frame: window.__vsEditor.getState().currentFrame, ws: window.__vsEditor.getState().workspace })) : "no-hook"`,
  returnByValue: true,
});
console.log("evaluate:", result.result?.value);
await sleep(1500);

const shot = await send("Page.captureScreenshot", { format: "png" });
writeFileSync(out, Buffer.from(shot.data, "base64"));
console.log("saved:", out);

ws.close();
chrome.kill();
process.exit(0);
