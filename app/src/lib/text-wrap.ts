/**
 * 文字断行工具（浏览器安全，不依赖 fontkit）。
 * 测量函数由调用方注入：Node 编译端用 fontkit，编辑器用 canvas 2D。
 * 渲染始终以预计算好的 lines 为准（编辑器与出片一致）。
 */

/** 行高倍数（v1 常数；CJK 可读性优先）。 */
export const LINE_HEIGHT_RATIO = 1.4;

/** 文字默认最大宽度（可用元素 maxWidth 覆盖）。 */
export const DEFAULT_MAX_WIDTH = 1200;

const TOKEN_RE =
  /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\u3000-\u303F]|[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*|\s+|[\s\S]/gu;

export function tokenize(text: string): string[] {
  return text.match(TOKEN_RE) ?? [];
}

const CLOSING_PUNCT = /^[）】》」』”’、，。；：！？…—·,.!?;:)\]}]$/;
const OPENING_PUNCT = /^[（【《「『“‘([{]$/;

/**
 * 贪心换行：CJK 逐字可断行，拉丁按词断行。
 * @param measure 测量单行文本宽度（由调用方按字体环境注入）
 */
export function wrapText(
  text: string,
  maxWidth: number,
  measure: (text: string) => number,
): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    if (paragraph === "") {
      lines.push("");
      continue;
    }
    const tokens = tokenize(paragraph);
    let line = "";
    for (const token of tokens) {
      const isSpace = /^\s+$/.test(token);
      if (isSpace && line === "") continue;
      if (line.length > 0 && CLOSING_PUNCT.test(token)) {
        line += token;
        continue;
      }
      const candidate = line + (isSpace ? "" : token);
      if (
        line.length > 0 &&
        !OPENING_PUNCT.test(token) &&
        measure(candidate) > maxWidth
      ) {
        lines.push(line.trimEnd());
        line = isSpace ? "" : token;
      } else {
        line = candidate;
      }
    }
    lines.push(line.trimEnd());
  }
  return lines;
}
