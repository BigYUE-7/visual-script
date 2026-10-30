import { z } from "zod";
import { Bounds, Easing, EmojiId, Id, NormalizedPoint, TextStylePreset } from "./common";

/**
 * 文字资产（编译产物）：实测包围盒 + 分行结果 + 锚点。
 * 渲染按 lines 逐行摆放，不依赖浏览器自动换行。
 */
export const TextAsset = z.object({
  form: z.literal("text"),
  id: z.string().min(1),
  /** 最终文本（literal 或锚点解析后的文字） */
  text: z.string(),
  preset: TextStylePreset,
  fontSize: z.number().positive(),
  fontWeight: z.number().int(),
  /** 已解析为 hex 的颜色 */
  color: z.string().min(1),
  align: z.enum(["left", "center", "right"]),
  /** 引擎分行结果 */
  lines: z.array(z.string()),
  lineHeight: z.number().positive(),
  bounds: Bounds,
  /** 归一化锚点（相对 bounds，0–1） */
  anchors: z.record(z.string(), NormalizedPoint),
}).strict();

/**
 * 图形资产（编译产物）：尺寸 + 锚点。
 */
export const ShapeAsset = z.object({
  form: z.literal("shape"),
  id: z.string().min(1),
  shape: z.enum([
    "rect",
    "circle",
    "line",
    "arrow",
    "triangle",
    "star",
    "heart",
  ]),
  /** 已解析为 hex 的颜色 */
  color: z.string().min(1),
  bounds: Bounds,
  anchors: z.record(z.string(), NormalizedPoint),
}).strict();

/**
 * emoji 资产（编译产物）：Twemoji 文件 + 尺寸 + 锚点。
 * 内容由内置 id 决定，渲染走图片文件，不用字体渲染。
 */
export const EmojiAsset = z.object({
  form: z.literal("emoji"),
  id: z.string().min(1),
  /** 内置 emoji id（schema/common.ts 的闭集） */
  emoji: EmojiId,
  /** 相对 public/ 的文件路径 */
  file: z.string().min(1),
  bounds: Bounds,
  anchors: z.record(z.string(), NormalizedPoint),
}).strict();

/**
 * 图片 / 矢量图资产（基石）：文件路径 + 尺寸 + 锚点。
 * SVG 命名元素锚点解析后续实现，IR 结构不变。
 */
export const ImageAsset = z.object({
  form: z.literal("image"),
  id: z.string().min(1),
  /** 相对 public/ 的文件路径 */
  file: z.string().min(1),
  bounds: Bounds,
  anchors: z.record(z.string(), NormalizedPoint),
}).strict();

/**
 * SVG 资产：AI 生成或手工放置的矢量素材（文件 + 尺寸 + 锚点）。
 * 生成时已保证无背景；尺寸由使用者按需设定；命名元素锚点解析后续实现。
 */
export const SvgAsset = z.object({
  form: z.literal("svg"),
  id: z.string().min(1),
  /** 相对 public/ 的文件路径 */
  file: z.string().min(1),
  bounds: Bounds,
  anchors: z.record(z.string(), NormalizedPoint),
}).strict();

/** 资产联合类型。 */
export const Asset = z.discriminatedUnion("form", [
  TextAsset,
  ShapeAsset,
  EmojiAsset,
  ImageAsset,
  SvgAsset,
]);

/**
 * 变换参数：x/y 为设计基准单位像素（对应 1920×1080 画布），scale/rotation/opacity 常规语义。
 */
export const Transform = z.object({
  x: z.number().default(0),
  y: z.number().default(0),
  scale: z.number().positive().default(1),
  rotation: z.number().default(0),
  opacity: z.number().min(0).max(1).default(1),
}).strict();

/**
 * 关键帧上的部分变换：只写被动画驱动的属性。
 * 注意与 Transform 的区别：字段无默认值（缺省 = 不由该关键帧控制），
 * 不能用 Transform.partial()（zod 会把默认值物化进缺失字段）。
 */
export const PartialTransform = z.object({
  x: z.number().optional(),
  y: z.number().optional(),
  scale: z.number().positive().optional(),
  rotation: z.number().optional(),
  opacity: z.number().min(0).max(1).optional(),
}).strict();

/**
 * 关键帧：某一帧上的变换状态 + 到下一帧的缓动。
 */
export const Keyframe = z.object({
  /** 关键帧所在帧号（相对对象出场） */
  frame: z.number().int().nonnegative(),
  /** 该帧的变换参数；未指定字段由前后关键帧插值 */
  transform: PartialTransform,
  /** 到下一关键帧的缓动曲线 */
  easing: Easing.optional().default("linear"),
}).strict();

/**
 * 场景对象：一个资产在画面中的时间线。
 */
export const SceneObject = z.object({
  id: Id,
  /** 资产 id 引用 */
  asset: z.string().min(1),
  /** 出场帧号（相对全片起点） */
  from: z.number().int().nonnegative(),
  /** 持续帧数 */
  durationInFrames: z.number().int().positive(),
  /** 图层 */
  layer: z.number().int().nonnegative(),
  /** 初始变换 */
  initial: Transform,
  /** 关键帧序列；必须按 frame 升序 */
  keyframes: z.array(Keyframe).default([]),
}).strict();

/**
 * 镜头运动：跳转 / 平移 / 缩放。
 * v1 先预留结构，P2 完整实现镜头语言。
 */
export const CameraMovement = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("jump"),
    fromFrame: z.number().int().nonnegative(),
    durationInFrames: z.number().int().positive(),
    center: NormalizedPoint,
    zoom: z.number().positive().default(1),
  }).strict(),
  z.object({
    type: z.literal("pan"),
    fromFrame: z.number().int().nonnegative(),
    durationInFrames: z.number().int().positive(),
    from: NormalizedPoint,
    to: NormalizedPoint,
    easing: Easing.optional().default("ease-in-out"),
  }).strict(),
  z.object({
    type: z.literal("zoom"),
    fromFrame: z.number().int().nonnegative(),
    durationInFrames: z.number().int().positive(),
    center: NormalizedPoint,
    fromZoom: z.number().positive().default(1),
    toZoom: z.number().positive(),
    easing: Easing.optional().default("ease-in-out"),
  }).strict(),
]);

/**
 * 音频片段：与口播分段一一对应。
 */
export const AudioSegment = z.object({
  file: z.string().min(1),
  fromFrame: z.number().int().nonnegative(),
  durationInFrames: z.number().int().positive(),
}).strict();

/**
 * 字幕（整句）：与口播分段一一对应；lines 为编译期测量好的分行结果。
 * v1 为整句显示，不做逐字高亮；文本是剥离锚点标记后的口播原文。
 */
export const SubtitleCue = z.object({
  narrationId: Id,
  text: z.string().min(1),
  lines: z.array(z.string()),
  fontSize: z.number().positive(),
  fontWeight: z.number().int(),
  lineHeight: z.number().positive(),
  fromFrame: z.number().int().nonnegative(),
  durationInFrames: z.number().int().positive(),
}).strict();

/**
 * Animation IR：帧级动画中间表示，直接喂给 Remotion 渲染。
 */
export const AnimationIR = z.object({
  version: z.literal(1),
  fps: z.number().int().positive(),
  /** 画布宽度（设计基准单位） */
  width: z.number().int().positive().default(1920),
  /** 画布高度（设计基准单位） */
  height: z.number().int().positive().default(1080),
  /** 全片总帧数 */
  totalFrames: z.number().int().positive(),
  /** 资产表：对象通过 asset id 引用 */
  assets: z.array(Asset),
  /** 场景对象 */
  objects: z.array(SceneObject),
  /** 镜头运动 */
  camera: z.array(CameraMovement).default([]),
  /** 音频 */
  audio: z.array(AudioSegment),
  /** 字幕（整句；旧 ir.json 缺省为空） */
  subtitles: z.array(SubtitleCue).default([]),
}).strict();

export type AnimationIR = z.infer<typeof AnimationIR>;
export type Asset = z.infer<typeof Asset>;
export type TextAsset = z.infer<typeof TextAsset>;
export type ShapeAsset = z.infer<typeof ShapeAsset>;
export type EmojiAsset = z.infer<typeof EmojiAsset>;
export type ImageAsset = z.infer<typeof ImageAsset>;
export type SvgAsset = z.infer<typeof SvgAsset>;
export type SceneObject = z.infer<typeof SceneObject>;
export type Keyframe = z.infer<typeof Keyframe>;
export type PartialTransform = z.infer<typeof PartialTransform>;
export type Transform = z.infer<typeof Transform>;
export type CameraMovement = z.infer<typeof CameraMovement>;
export type AudioSegment = z.infer<typeof AudioSegment>;
export type SubtitleCue = z.infer<typeof SubtitleCue>;
