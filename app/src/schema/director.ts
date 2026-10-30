import { z } from "zod";
import { AnchorRef, AspectRatio, Color, Easing, EmojiId, Id, Slot, TextStylePreset } from "./common";

/**
 * 口播分段：完整语义 1–3 句为一块。
 */
export const Narration = z.object({
  id: Id,
  /** 口播文本，用 [[锚点文本]] 或 [[anchorId|锚点文本]] 标记关键词 */
  text: z.string().min(1),
  /** 本段语音结束 → 下一段语音开始的间隔（节奏主旋钮） */
  gapAfterMs: z.number().nonnegative().default(350),
  /** 本段画面至少停留时长；动画演示比语音长时使用 */
  minHoldMs: z.number().nonnegative().default(0),
}).strict();

/**
 * 文字占位符元素：画面上的文字槽位。
 */
export const TextElement = z.object({
  id: Id,
  kind: z.literal("text"),
  /** 图层，越大越在上层 */
  layer: z.number().int().nonnegative(),
  /** 样式预设名 */
  preset: TextStylePreset,
  /** 内容来源：固定文字 或 口播锚点绑定 */
  content: z.discriminatedUnion("type", [
    z.object({
      type: z.literal("literal"),
      text: z.string().min(1),
    }).strict(),
    z.object({
      type: z.literal("narration"),
      narrationId: Id,
      /** 对应 narration.text 中的 [[锚点文本]] */
      anchor: z.string().min(1),
    }).strict(),
  ]),
  /** 最大宽度，超出自动换行 */
  maxWidth: z.number().positive().optional(),
  /** 水平对齐 */
  align: z.enum(["left", "center", "right"]).optional().default("center"),
  /** 语义槽位：默认位置（编译器映射为画布坐标） */
  slot: Slot.optional().default("center"),
}).strict();

/**
 * 简单几何元素：v1 用矩形、圆、直线、箭头直接走通链路。
 */
export const ShapeElement = z.object({
  id: Id,
  kind: z.literal("shape"),
  layer: z.number().int().nonnegative(),
  shape: z.enum(["rect", "circle", "line", "arrow", "triangle", "star", "heart"]),
  color: Color,
  width: z.number().positive(),
  height: z.number().positive(),
  /** 语义槽位：默认位置（编译器映射为画布坐标） */
  slot: Slot.optional().default("center"),
}).strict();

/**
 * 内置 emoji 元素：引用 Twemoji 精选资产（LLM 只选 id）。
 */
export const EmojiElement = z.object({
  id: Id,
  kind: z.literal("emoji"),
  layer: z.number().int().nonnegative(),
  emoji: EmojiId,
  /** 语义槽位：默认位置（编译器映射为画布坐标） */
  slot: Slot.optional().default("center"),
}).strict();

/**
 * 素材库元素：引用已入库的 SVG 素材（LLM 只选 id）。
 * 素材文件与元数据见 public/library/index.json。
 */
export const AssetElement = z.object({
  id: Id,
  kind: z.literal("asset"),
  layer: z.number().int().nonnegative(),
  /** 素材库条目 id */
  asset: z.string().min(1),
  /** 语义槽位：默认位置（编译器映射为画布坐标） */
  slot: Slot.optional().default("center"),
  /** 可选：显示宽度（缺省取素材库 defaultWidth） */
  width: z.number().positive().optional(),
}).strict();

/**
 * 导演稿中的元素：文字占位符 / 简单几何 / 内置 emoji / 素材库 SVG。
 */
export const DirectorElement = z.discriminatedUnion("kind", [
  TextElement,
  ShapeElement,
  EmojiElement,
  AssetElement,
]);

/**
 * Cue 动作：出现。
 */
export const AppearAction = z.object({
  type: z.literal("appear"),
  element: Id,
  /** 出现时机：段首或锚点时刻 */
  at: z.enum(["start", "anchor"]).optional().default("anchor"),
  /** 入场动画预设 */
  preset: z
    .enum(["fade", "pop", "slide_up", "slide_down", "slide_left", "slide_right", "zoom"])
    .optional()
    .default("fade"),
  /** 滑入距离（设计基准单位像素） */
  distancePx: z.number().positive().optional().default(80),
}).strict();

/**
 * Cue 动作：消失。
 */
export const DisappearAction = z.object({
  type: z.literal("disappear"),
  element: Id,
  /** 退场动画预设 */
  preset: z.enum(["fade", "shrink"]).optional().default("fade"),
}).strict();

/**
 * Cue 动作：氛围动画（一次性播放，结束后回到原状态）。
 */
export const AnimateAction = z.object({
  type: z.literal("animate"),
  element: Id,
  /** 氛围预设：float 漂浮 / shake 摇晃 / bounce 弹跳 / wiggle 摆动 */
  preset: z.enum(["float", "shake", "bounce", "wiggle"]),
  easing: Easing.optional().default("ease-in-out"),
}).strict();

/**
 * Cue 动作：强调（放大后回弹）。
 */
export const EmphasizeAction = z.object({
  type: z.literal("emphasize"),
  element: Id,
  /** 强调时的缩放比例 */
  scale: z.number().positive().optional().default(1.2),
  /** 缓动曲线 */
  easing: Easing.optional().default("ease-out"),
}).strict();

/**
 * Cue 动作：移动到某锚点。
 */
export const MoveAction = z.object({
  type: z.literal("move"),
  element: Id,
  /** 目标锚点引用，如 plant.leaf */
  to: AnchorRef,
  /** 目标点偏移（像素，设计基准单位） */
  offsetX: z.number().optional().default(0),
  offsetY: z.number().optional().default(0),
  easing: Easing.optional().default("ease-in-out"),
}).strict();

/**
 * Cue 动作联合类型：出现 / 消失 / 强调 / 移动 / 氛围动画。
 */
export const CueAction = z.discriminatedUnion("type", [
  AppearAction,
  DisappearAction,
  EmphasizeAction,
  MoveAction,
  AnimateAction,
]);

/**
 * Cue：绑定到口播锚点的动画触发器。
 */
export const Cue = z.object({
  id: Id,
  /** 触发点：哪一段的哪个锚点 */
  on: z.object({
    narrationId: Id,
    anchor: z.string().min(1),
  }).strict(),
  action: CueAction,
  /** 动作持续时长（毫秒） */
  durationMs: z.number().positive(),
}).strict();

/**
 * 导演稿：LLM 产出的第一层语义产物，不含绝对时间。
 */
export const DirectorScript = z.object({
  version: z.literal(1),
  meta: z.object({
    title: z.string().min(1),
    audience: z.string().optional(),
    style: z.string().optional(),
    fps: z.number().int().positive().default(30),
    aspect: AspectRatio.default("16:9"),
  }).strict(),
  narrations: z.array(Narration).min(1),
  elements: z.array(DirectorElement),
  cues: z.array(Cue),
}).strict();

export type DirectorScript = z.infer<typeof DirectorScript>;
export type Narration = z.infer<typeof Narration>;
export type DirectorElement = z.infer<typeof DirectorElement>;
export type TextElement = z.infer<typeof TextElement>;
export type ShapeElement = z.infer<typeof ShapeElement>;
export type EmojiElement = z.infer<typeof EmojiElement>;
export type AssetElement = z.infer<typeof AssetElement>;
export type Cue = z.infer<typeof Cue>;
export type CueAction = z.infer<typeof CueAction>;
export type AppearAction = z.infer<typeof AppearAction>;
export type DisappearAction = z.infer<typeof DisappearAction>;
export type AnimateAction = z.infer<typeof AnimateAction>;
