import { LINE_HEIGHT_RATIO } from "../lib/text-wrap";
import type { TextStylePreset } from "../schema/common";

/** 字号阶梯（1080p 画布基准），来自《文字占位符与字体设计》§2.4。 */
export const TEXT_PRESETS: Record<
  TextStylePreset,
  { fontSize: number; weight: number }
> = {
  title: { fontSize: 96, weight: 700 },
  heading: { fontSize: 72, weight: 700 },
  keyword: { fontSize: 84, weight: 700 },
  subtitle: { fontSize: 48, weight: 500 },
  body: { fontSize: 40, weight: 400 },
  caption: { fontSize: 32, weight: 400 },
};

/** v1 主题颜色令牌默认值（正式主题设计前先用这套）。 */
export const COLOR_TOKENS = {
  primary: "#1F2937",
  accent: "#D97706",
  text: "#374151",
  muted: "#9CA3AF",
  subtitle: "#4B5563",
  /** 浅灰氛围色（背景垫底用） */
  wash: "#F3F4F6",
  /** 浅暖氛围色（背景垫底用） */
  soft: "#FFFBEB",
} as const;

export type ColorToken = keyof typeof COLOR_TOKENS;

const PRESET_COLOR: Record<TextStylePreset, ColorToken> = {
  title: "primary",
  heading: "primary",
  keyword: "accent",
  subtitle: "subtitle",
  body: "text",
  caption: "muted",
};

/** 把颜色令牌或 hex 解析为 hex。 */
export function resolveColor(color: string): string {
  if (color.startsWith("#")) return color;
  const token = COLOR_TOKENS[color as ColorToken];
  if (!token) {
    throw new Error(`未知颜色令牌：${color}`);
  }
  return token;
}

/** 取文字预设对应的颜色 hex。 */
export function presetColor(preset: TextStylePreset): string {
  return COLOR_TOKENS[PRESET_COLOR[preset]];
}

/** 背景色（v1 固定浅色）。 */
export const BACKGROUND_COLOR = "#FFFFFF";

/** 字幕版式：距画布底边的边距（设计基准单位）。 */
export const SUBTITLE_BOTTOM_MARGIN = 64;

/**
 * 字幕安全区：画布底部此高度内不放置场景元素。
 * 按最多两行字幕 + 与内容之间的呼吸间距预留（编译期确定性规则）。
 */
export const SUBTITLE_SAFE_ZONE =
  SUBTITLE_BOTTOM_MARGIN +
  2 * Math.round(TEXT_PRESETS.subtitle.fontSize * LINE_HEIGHT_RATIO) +
  24;
