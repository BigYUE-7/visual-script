import type { LibraryAsset } from "../schema/library";

/** 2-gram 集合（忽略空白与标点，中文按字）。 */
function bigrams(text: string): Set<string> {
  const normalized = text.toLowerCase().replace(/[\s\p{P}\p{S}]/gu, "");
  const set = new Set<string>();
  for (let i = 0; i < normalized.length - 1; i += 1) {
    set.add(normalized.slice(i, i + 2));
  }
  return set;
}

/**
 * 按描述在素材库中找相似素材（生成前提示用，不阻止生成新的）。
 * 规则：名称命中权重 5、标签命中 4；描述/名称/标签的 2-gram 重叠每 4 个 +1。
 */
export function findSimilarAssets(
  description: string,
  library: LibraryAsset[],
  limit = 3,
): LibraryAsset[] {
  const text = description.trim().toLowerCase();
  if (!text || library.length === 0) return [];
  const textBigrams = bigrams(text);

  const scored = library.map((entry) => {
    let score = 0;
    const name = entry.name.toLowerCase();
    if (name && text.includes(name)) score += 5;
    for (const tag of entry.tags) {
      const t = tag.toLowerCase();
      if (t && text.includes(t)) score += 4;
    }
    const target =
      `${entry.name}${entry.description}${entry.tags.join("")}`.toLowerCase();
    let overlap = 0;
    for (const bg of textBigrams) {
      if (target.includes(bg)) overlap += 1;
    }
    score += Math.floor(overlap / 4);
    return { entry, score };
  });

  return scored
    .filter((s) => s.score >= 3)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.entry);
}
