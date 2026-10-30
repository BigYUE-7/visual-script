import type { EmojiId } from "../schema/common";

/**
 * 内置 emoji 精选集（Twemoji，CC-BY 4.0）。
 * id 的闭集定义在 `src/schema/common.ts` 的 EmojiId；
 * 本表提供 id → 文件路径与中文名（编辑器 UI 展示用）。
 */
export const EMOJI_FILES: Record<EmojiId, { file: string; label: string }> = {
  sun: { file: "twemoji/2600.svg", label: "太阳" },
  cloud: { file: "twemoji/2601.svg", label: "云" },
  droplet: { file: "twemoji/1f4a7.svg", label: "水滴" },
  leaf: { file: "twemoji/1f343.svg", label: "叶子" },
  seedling: { file: "twemoji/1f331.svg", label: "幼苗" },
  "light-bulb": { file: "twemoji/1f4a1.svg", label: "灯泡" },
  atom: { file: "twemoji/269b.svg", label: "原子" },
  microscope: { file: "twemoji/1f52c.svg", label: "显微镜" },
  telescope: { file: "twemoji/1f52d.svg", label: "望远镜" },
  rocket: { file: "twemoji/1f680.svg", label: "火箭" },
  globe: { file: "twemoji/1f30d.svg", label: "地球" },
  star: { file: "twemoji/2b50.svg", label: "星星" },
  sparkles: { file: "twemoji/2728.svg", label: "闪光" },
  heart: { file: "twemoji/2764.svg", label: "爱心" },
  warning: { file: "twemoji/26a0.svg", label: "警告" },
  check: { file: "twemoji/2705.svg", label: "对勾" },
  cross: { file: "twemoji/274c.svg", label: "叉号" },
  question: { file: "twemoji/2753.svg", label: "问号" },
  book: { file: "twemoji/1f4d6.svg", label: "书本" },
  brain: { file: "twemoji/1f9e0.svg", label: "大脑" },
  dna: { file: "twemoji/1f9ec.svg", label: "DNA" },
  battery: { file: "twemoji/1f50b.svg", label: "电池" },
  gear: { file: "twemoji/2699.svg", label: "齿轮" },
  magnifier: { file: "twemoji/1f50d.svg", label: "放大镜" },
  fire: { file: "twemoji/1f525.svg", label: "火焰" },
  snowflake: { file: "twemoji/2744.svg", label: "雪花" },
  wave: { file: "twemoji/1f30a.svg", label: "海浪" },
};

/** emoji 资产默认尺寸（设计基准单位，1080p 画布）。 */
export const EMOJI_DEFAULT_SIZE = 220;
