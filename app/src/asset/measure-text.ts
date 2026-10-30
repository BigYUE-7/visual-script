import { openSync, type Font } from "fontkit";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_MAX_WIDTH,
  LINE_HEIGHT_RATIO,
  wrapText,
} from "../lib/text-wrap";
import { FONT_FILE_NAME } from "./font-constants";

const here = dirname(fileURLToPath(import.meta.url));

/** 内置字体文件（随包分发，不依赖系统字体）。 */
export const FONT_PATH = join(here, "..", "..", "public", "fonts", FONT_FILE_NAME);
export { FONT_FILE_NAME, FONT_FAMILY } from "./font-constants";
export { DEFAULT_MAX_WIDTH, LINE_HEIGHT_RATIO } from "../lib/text-wrap";

let fontCache: Font | null = null;

function loadFont(): Font {
  if (fontCache) return fontCache;
  const opened = openSync(FONT_PATH);
  if (!("layout" in opened)) {
    throw new Error("内置字体文件是字体集合（TTC），v1 不支持");
  }
  fontCache = opened as Font;
  return fontCache;
}

function fontAtWeight(weight: number): Font {
  const font = loadFont();
  if (typeof font.getVariation !== "function") return font;
  const wght = weight >= 700 ? 700 : weight >= 500 ? 500 : 400;
  return font.getVariation({ wght });
}

/** 单行文本宽度（设计基准单位 px）。 */
export function measureTextWidth(text: string, fontSize: number, weight: number): number {
  const font = fontAtWeight(weight);
  const scale = fontSize / font.unitsPerEm;
  const run = font.layout(text);
  let width = 0;
  for (const pos of run.positions) {
    width += pos.xAdvance;
  }
  return width * scale;
}

export type MeasuredText = {
  lines: string[];
  /** 包围盒宽度 = 最长行宽 */
  width: number;
  /** 包围盒高度 = 行数 × 行高 */
  height: number;
  fontSize: number;
  lineHeight: number;
};

/** 测量文字占位符：换行 + 包围盒（引擎实测，不手填）。 */
export function measureText(
  text: string,
  options: { fontSize: number; weight: number; maxWidth?: number },
): MeasuredText {
  const { fontSize, weight, maxWidth = DEFAULT_MAX_WIDTH } = options;
  const lines = wrapText(text, maxWidth, (candidate) =>
    measureTextWidth(candidate, fontSize, weight),
  );
  let width = 0;
  for (const line of lines) {
    const w = measureTextWidth(line, fontSize, weight);
    if (w > width) width = w;
  }
  const lineHeight = Math.round(fontSize * LINE_HEIGHT_RATIO);
  return {
    lines,
    width: Math.max(1, Math.round(width)),
    height: Math.max(lineHeight, lines.length * lineHeight),
    fontSize,
    lineHeight,
  };
}
