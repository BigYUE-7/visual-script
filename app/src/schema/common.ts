import { z } from "zod";

/**
 * 全局唯一 id：小写字母开头，后可跟小写字母、数字、连字符。
 */
export const Id = z
  .string()
  .regex(/^[a-z][a-z0-9-]*$/, "id 必须以小写字母开头，只含小写字母、数字、连字符");

/**
 * 归一化坐标，相对资产包围盒，范围 0–1。
 */
export const NormalizedPoint = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
}).strict();

/**
 * 颜色：v1 支持 hex 字符串或主题令牌名（如 primary、accent）。
 * wash / soft 为浅色氛围令牌（背景垫底用），2026-10-08 新增。
 */
export const Color = z.union([
  z.string().regex(/^#[0-9A-Fa-f]{6}$/, "颜色必须是 #RRGGBB 格式"),
  z.enum(["primary", "accent", "text", "muted", "subtitle", "wash", "soft"]),
]);

/**
 * 缓动类型：v1 只支持四种基础曲线。
 */
export const Easing = z.enum(["linear", "ease-in", "ease-out", "ease-in-out"]);

/**
 * 锚点引用语法：assetId.anchorName。
 */
export const AnchorRef = z
  .string()
  .regex(/^[a-z][a-z0-9-]*\.[a-z][a-z0-9_]*$/, "锚点引用必须是 assetId.anchorName 格式");

/**
 * 文字样式预设：LLM 只选名字，不直接写字号/颜色。
 */
export const TextStylePreset = z.enum([
  "title",
  "heading",
  "keyword",
  "subtitle",
  "body",
  "caption",
]);

/**
 * 内置 emoji 资产 id（Twemoji 精选集）。
 * LLM 只选名字，不写文件名/坐标；对应文件由 `src/asset/emoji.ts` 映射。
 */
export const EmojiId = z.enum([
  "sun",
  "cloud",
  "droplet",
  "leaf",
  "seedling",
  "light-bulb",
  "atom",
  "microscope",
  "telescope",
  "rocket",
  "globe",
  "star",
  "sparkles",
  "heart",
  "warning",
  "check",
  "cross",
  "question",
  "book",
  "brain",
  "dna",
  "battery",
  "gear",
  "magnifier",
  "fire",
  "snowflake",
  "wave",
]);

/**
 * 语义槽位：元素在画布上的默认位置（LLM 只选名字，不写坐标）。
 * 编译器把槽位映射为归一化位置；cue 的 move 动作可在其上继续移动。
 */
export const Slot = z.enum([
  "center",
  "top",
  "bottom",
  "left",
  "right",
  "top_left",
  "top_right",
  "bottom_left",
  "bottom_right",
]);

/**
 * 画布比例：v1 只支持 16:9。
 */
export const AspectRatio = z.enum(["16:9"]);

/**
 * 包围盒：设计基准单位（通常对应 1920×1080 画布）。
 */
export const Bounds = z.object({
  width: z.number().positive(),
  height: z.number().positive(),
}).strict();

export type Id = z.infer<typeof Id>;
export type NormalizedPoint = z.infer<typeof NormalizedPoint>;
export type Color = z.infer<typeof Color>;
export type Easing = z.infer<typeof Easing>;
export type AnchorRef = z.infer<typeof AnchorRef>;
export type EmojiId = z.infer<typeof EmojiId>;
export type TextStylePreset = z.infer<typeof TextStylePreset>;
export type Slot = z.infer<typeof Slot>;
export type AspectRatio = z.infer<typeof AspectRatio>;
export type Bounds = z.infer<typeof Bounds>;
