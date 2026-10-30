// 下载内置字体：Noto Sans SC（可变字重，OFL）
// 与"思源黑体 SC"同源；设计文档允许二者等价使用。
// 用法：npm run fetch-fonts

import { spawnSync } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import { readFile, rename, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

const here = dirname(fileURLToPath(import.meta.url));
const fontsDir = join(here, "..", "public", "fonts");

const FONT_URL =
  "https://github.com/google/fonts/raw/main/ofl/notosanssc/NotoSansSC%5Bwght%5D.ttf";
const LICENSE_URL =
  "https://github.com/google/fonts/raw/main/ofl/notosanssc/OFL.txt";

const FONT_FILE = "NotoSansSC-VF.ttf";
const LICENSE_FILE = "OFL.txt";

async function download(url, dest) {
  try {
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok || !res.body) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }
    await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
    return;
  } catch (err) {
    console.warn(`  Node fetch 失败（${err.message}），尝试 curl.exe ...`);
  }
  const curl = spawnSync(
    "curl.exe",
    ["-L", "--fail", "--retry", "3", "-o", dest, url],
    { stdio: "inherit" },
  );
  if (curl.status !== 0) {
    throw new Error(`curl 下载失败（exit ${curl.status}）：${url}`);
  }
}

async function main() {
  mkdirSync(fontsDir, { recursive: true });

  const fontPath = join(fontsDir, FONT_FILE);
  if (existsSync(fontPath)) {
    const info = await stat(fontPath);
    console.log(`已存在，跳过下载：${FONT_FILE}（${(info.size / 1024 / 1024).toFixed(1)} MB）`);
  } else {
    const tmp = fontPath + ".part";
    console.log(`下载 ${FONT_URL} ...`);
    await download(FONT_URL, tmp);
    await rename(tmp, fontPath);
    const info = await stat(fontPath);
    if (info.size < 1024 * 1024) {
      await rm(fontPath);
      throw new Error("字体文件异常（小于 1MB），已删除，请重试");
    }
    console.log(`完成：${FONT_FILE}（${(info.size / 1024 / 1024).toFixed(1)} MB）`);
  }

  const licensePath = join(fontsDir, LICENSE_FILE);
  if (existsSync(licensePath)) {
    console.log(`已存在，跳过下载：${LICENSE_FILE}`);
  } else {
    console.log(`下载 ${LICENSE_URL} ...`);
    await download(LICENSE_URL, licensePath);
    const text = await readFile(licensePath, "utf-8");
    if (!text.includes("SIL OPEN FONT LICENSE")) {
      await rm(licensePath);
      throw new Error("许可证文件内容异常，已删除，请重试");
    }
    console.log(`完成：${LICENSE_FILE}`);
  }
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
