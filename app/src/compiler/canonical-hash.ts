import { createHash } from "node:crypto";

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  if (value !== null && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      sorted[key] = sortValue(obj[key]);
    }
    return sorted;
  }
  return value;
}

/** 稳定的 JSON 序列化：对象键递归排序，保证同一数据 → 同一字符串。 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

/** 对象内容的 sha256（带 "sha256:" 前缀）。 */
export function sha256Of(value: unknown): string {
  const hex = createHash("sha256")
    .update(canonicalJson(value), "utf8")
    .digest("hex");
  return `sha256:${hex}`;
}

/** 文本内容的 sha256（带 "sha256:" 前缀）。 */
export function sha256OfText(text: string): string {
  const hex = createHash("sha256").update(text, "utf8").digest("hex");
  return `sha256:${hex}`;
}
