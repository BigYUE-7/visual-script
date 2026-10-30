/**
 * SVG 素材的消毒、校验与元信息解析。
 * AI 生成（src/cli/generate-asset.ts）与编辑器保存（/api/save-asset）共用同一入口；
 * 生成的素材默认无背景，尺寸由 IR 的 bounds 决定（不写死在文件里）。
 */

export type SvgMeta = {
  /** 消毒后的 SVG 文本 */
  svg: string;
  /** viewBox 宽度 */
  width: number;
  /** viewBox 高度 */
  height: number;
};

/** 允许的用色（与主题令牌一致 + 少量辅助色；提示词与人工检查共用）。 */
export const SVG_PALETTE = [
  { hex: "#1F2937", name: "主色·深灰蓝" },
  { hex: "#D97706", name: "强调·橙" },
  { hex: "#2563EB", name: "辅助·蓝" },
  { hex: "#16A34A", name: "辅助·绿" },
  { hex: "#4B5563", name: "次级灰" },
  { hex: "#9CA3AF", name: "弱化灰" },
  { hex: "#E11D48", name: "警示·红" },
  { hex: "#FFFFFF", name: "白（点缀）" },
] as const;

export class SvgValidationError extends Error {}

const FORBIDDEN_PATTERNS: { re: RegExp; message: string }[] = [
  { re: /<script[\s>]/i, message: "包含 <script>" },
  { re: /<foreignObject[\s>]/i, message: "包含 <foreignObject>" },
  { re: /\son[a-z]+\s*=/i, message: "包含事件属性（on*）" },
  { re: /<\s*image[\s>]/i, message: "包含 <image> 外链位图" },
  { re: /(?:href|src)\s*=\s*["'](?:https?:|\/\/|data:)/i, message: "包含外部引用" },
  { re: /@import|url\s*\(\s*["']?https?:/i, message: "包含外部样式引用" },
];

/** 去掉 markdown 围栏与多余包裹，截取 <svg>...</svg>。 */
function extractSvg(raw: string): string {
  let text = raw.trim();
  const fence = /^```(?:svg|xml|html)?\s*([\s\S]*?)\s*```$/.exec(text);
  if (fence) text = fence[1].trim();
  const start = text.indexOf("<svg");
  const end = text.lastIndexOf("</svg>");
  if (start === -1 || end === -1) {
    throw new SvgValidationError("未找到完整 <svg>...</svg>");
  }
  return text.slice(start, end + "</svg>".length);
}

/** 解析 viewBox；缺失时退回 width/height 属性。 */
function readViewBox(svg: string): { width: number; height: number } {
  const match =
    /<svg[^>]*\sviewBox\s*=\s*["']\s*([-\d.]+)[\s,]+([-\d.]+)[\s,]+([-\d.]+)[\s,]+([-\d.]+)\s*["']/i.exec(
      svg,
    );
  if (match) {
    const width = Number(match[3]);
    const height = Number(match[4]);
    if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
      return { width, height };
    }
  }
  const wAttr = /\swidth\s*=\s*["']([\d.]+)/i.exec(svg);
  const hAttr = /\sheight\s*=\s*["']([\d.]+)/i.exec(svg);
  if (wAttr && hAttr) {
    const width = Number(wAttr[1]);
    const height = Number(hAttr[1]);
    if (width > 0 && height > 0) return { width, height };
  }
  throw new SvgValidationError("缺少 viewBox（或 width/height）");
}

/** 规范化根 <svg>：补 xmlns、去掉固定 width/height（尺寸交给 IR bounds）。 */
function normalizeRoot(
  svg: string,
  viewBox: { width: number; height: number },
): string {
  return svg.replace(/<svg\b[^>]*>/i, (tag) => {
    let out = tag;
    if (!/\sxmlns\s*=/.test(out)) {
      out = out.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
    }
    if (!/\sviewBox\s*=/.test(out)) {
      out = out.replace(
        "<svg",
        `<svg viewBox="0 0 ${viewBox.width} ${viewBox.height}"`,
      );
    }
    out = out.replace(/\swidth\s*=\s*["'][^"']*["']/i, "");
    out = out.replace(/\sheight\s*=\s*["'][^"']*["']/i, "");
    return out;
  });
}

/** 消毒 + 校验 + 解析元信息（AI 输出与用户保存的唯一入口）。 */
export function sanitizeSvg(raw: string): SvgMeta {
  const svg = extractSvg(raw);
  for (const { re, message } of FORBIDDEN_PATTERNS) {
    if (re.test(svg)) {
      throw new SvgValidationError(`SVG 不合规：${message}`);
    }
  }
  const viewBox = readViewBox(svg);
  const ratio = viewBox.width / viewBox.height;
  if (ratio > 8 || ratio < 1 / 8) {
    throw new SvgValidationError(
      `viewBox 比例异常：${viewBox.width}×${viewBox.height}`,
    );
  }
  return {
    svg: normalizeRoot(svg, viewBox),
    width: viewBox.width,
    height: viewBox.height,
  };
}

/** 编辑器预览用 data URL（不落盘；内容已消毒）。 */
export function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
