import { z } from "zod";
import { Id } from "./common";

/**
 * 素材库条目：一个已入库的 SVG（或未来的图片）资产。
 * 名称/介绍由 LLM 生成或人工填写，供导演稿生成时挑选引用。
 */
export const LibraryAsset = z.object({
  id: Id,
  /** 中文名（2-8 字，LLM 挑选时优先看它） */
  name: z.string().min(1).max(24),
  /** 一句话介绍（这是什么 / 能表达什么概念） */
  description: z.string().min(1).max(120),
  /** 集合（素材包）：素材库按集合分组展示与整组勾选 */
  collection: z.string().min(1).max(24).default("未分组"),
  /** 领域 / 类别标签，便于筛选与检索 */
  tags: z.array(z.string().min(1).max(16)).max(6).default([]),
  /** 相对 public/ 的文件路径（如 library/svg/mito.svg） */
  file: z.string().min(1),
  /** 轻量缩略图（小图 PNG，相对 public/；缺省时 UI 回退用原 SVG 预览） */
  thumbnail: z.string().min(1).optional(),
  /** 素材原始坐标系尺寸 */
  viewBox: z.object({
    width: z.number().positive(),
    height: z.number().positive(),
  }).strict(),
  /** 默认显示宽度（设计基准单位 px；高度按 viewBox 比例换算） */
  defaultWidth: z.number().positive().default(360),
  /** 来源：ai=模型生成 / user=手工 / builtin=内置 */
  source: z.enum(["ai", "user", "builtin"]).default("ai"),
  createdAt: z.string().min(1),
  /** AI 生成参数（供"AI 使用披露"与复现） */
  generator: z.object({
    provider: z.string().min(1),
    prompt: z.string().min(1),
  }).strict().optional(),
}).strict();

/** 素材库索引（唯一事实源）。 */
export const AssetLibrary = z.object({
  version: z.literal(1),
  assets: z.array(LibraryAsset),
}).strict();

export type LibraryAsset = z.infer<typeof LibraryAsset>;
export type AssetLibrary = z.infer<typeof AssetLibrary>;
