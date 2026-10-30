import { FONT_FAMILY } from "@app/asset/font-constants";
import {
  DEFAULT_MAX_WIDTH,
  LINE_HEIGHT_RATIO,
  wrapText,
} from "@app/lib/text-wrap";

/**
 * 编辑器浏览器端测量：与编译端（fontkit）同一套断行规则，
 * 仅测量实现不同（canvas 2D）。结果写回 IR 后，预览与出片一致。
 */

let ctx: CanvasRenderingContext2D | null = null;

function context(): CanvasRenderingContext2D {
  if (!ctx) {
    ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) throw new Error("无法创建 canvas 2D 上下文");
  }
  return ctx;
}

/** 单行文本宽度（设计基准单位 px）。 */
export function measureTextWidthInBrowser(
  text: string,
  fontSize: number,
  weight: number,
): number {
  const c = context();
  c.font = `${weight} ${fontSize}px ${FONT_FAMILY}`;
  return c.measureText(text).width;
}

export type MeasuredTextBrowser = {
  lines: string[];
  width: number;
  height: number;
  fontSize: number;
  lineHeight: number;
};

/** 测量文字：先等内置字体就绪，再按共享规则换行。 */
export async function measureTextInBrowser(
  text: string,
  options: { fontSize: number; weight: number; maxWidth?: number },
): Promise<MeasuredTextBrowser> {
  await document.fonts.ready;
  const { fontSize, weight, maxWidth = DEFAULT_MAX_WIDTH } = options;
  const measure = (candidate: string) =>
    measureTextWidthInBrowser(candidate, fontSize, weight);

  const lines = wrapText(text, maxWidth, measure);
  let width = 0;
  for (const line of lines) {
    const w = measure(line);
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
