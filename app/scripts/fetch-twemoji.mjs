import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * 拉取精选 Twemoji SVG 到 public/twemoji/（渲染与编辑器共用）。
 * 用法：npm run fetch-emoji [-- --force]
 *
 * 注意：列表必须与 src/schema/common.ts 的 EmojiId、src/asset/emoji.ts 的 EMOJI_FILES 同步。
 * Twemoji 图形：Twitter, Inc and other contributors，CC-BY 4.0（署名见 ATTRIBUTION.md）。
 */

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "public", "twemoji");

const TWEMOJI_VERSION = "15.1.0";
const BASE = `https://cdn.jsdelivr.net/gh/jdecked/twemoji@${TWEMOJI_VERSION}/assets/svg`;

// [id, codepoint 文件名（不含扩展名）]
const EMOJI = [
  ["sun", "2600"],
  ["cloud", "2601"],
  ["droplet", "1f4a7"],
  ["leaf", "1f343"],
  ["seedling", "1f331"],
  ["light-bulb", "1f4a1"],
  ["atom", "269b"],
  ["microscope", "1f52c"],
  ["telescope", "1f52d"],
  ["rocket", "1f680"],
  ["globe", "1f30d"],
  ["star", "2b50"],
  ["sparkles", "2728"],
  ["heart", "2764"],
  ["warning", "26a0"],
  ["check", "2705"],
  ["cross", "274c"],
  ["question", "2753"],
  ["book", "1f4d6"],
  ["brain", "1f9e0"],
  ["dna", "1f9ec"],
  ["battery", "1f50b"],
  ["gear", "2699"],
  ["magnifier", "1f50d"],
  ["fire", "1f525"],
  ["snowflake", "2744"],
  ["wave", "1f30a"],
];

const force = process.argv.includes("--force");
mkdirSync(outDir, { recursive: true });

let downloaded = 0;
let skipped = 0;
for (const [id, code] of EMOJI) {
  const file = join(outDir, `${code}.svg`);
  if (existsSync(file) && !force) {
    skipped += 1;
    continue;
  }
  const url = `${BASE}/${code}.svg`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`emoji「${id}」下载失败：HTTP ${res.status}\n${url}`);
  }
  const svg = await res.text();
  if (!svg.includes("<svg")) {
    throw new Error(`emoji「${id}」内容异常（不是 SVG）：${url}`);
  }
  writeFileSync(file, svg, "utf-8");
  downloaded += 1;
  console.log(`ok   ${code}.svg  (${id})`);
}

const attribution = `# Twemoji 图形署名

本目录的 SVG 图形来自 Twemoji 项目（jdecked/twemoji fork）：

- 图形版权：Copyright ${new Date().getFullYear()} Twitter, Inc and other contributors
- 许可：CC-BY 4.0 — https://creativecommons.org/licenses/by/4.0/
- 来源：https://github.com/jdecked/twemoji （assets/svg，版本 ${TWEMOJI_VERSION}）
- 拉取脚本：app/scripts/fetch-twemoji.mjs

如需再分发二进制包或公网部署，请保留本文件与上述署名。
`;
writeFileSync(join(outDir, "ATTRIBUTION.md"), attribution, "utf-8");

console.log(
  `\n完成：下载 ${downloaded} 个 / 跳过 ${skipped} 个 → public/twemoji/`,
);
