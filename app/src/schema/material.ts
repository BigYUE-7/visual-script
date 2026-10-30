import { z } from "zod";
import { Id, NormalizedPoint } from "./common";

/**
 * 锚点名：小写字母开头，后可跟小写字母、数字、下划线。
 */
export const AnchorName = z
  .string()
  .regex(/^[a-z][a-z0-9_]*$/, "锚点名必须以小写字母开头，只含小写字母、数字、下划线");

/**
 * 素材合成稿条目：描述"要造哪些资产、怎么造"。
 */
export const MaterialItem = z.object({
  /** 资产文件名或资产 id */
  asset: z.string().min(1),
  /** 引用该资产的导演稿 element id 列表 */
  usedBy: z.array(Id),
  /** 资产获取策略 */
  source: z.enum(["builtin", "library", "variant", "compose", "ai"]),
  /** 对资产的描述，用于生成或检索 */
  description: z.string().min(1),
  /** 自定义锚点；默认锚点由资产类型自动生成 */
  anchors: z.record(AnchorName, NormalizedPoint).optional(),
  /** 生产状态 */
  status: z.enum(["pending", "ready", "failed"]).default("pending"),
}).strict();

/**
 * 素材合成稿：由导演稿 elements[] 推导出的独立产物。
 */
export const MaterialScript = z.object({
  version: z.literal(1),
  items: z.array(MaterialItem),
}).strict();

export type MaterialScript = z.infer<typeof MaterialScript>;
export type MaterialItem = z.infer<typeof MaterialItem>;
