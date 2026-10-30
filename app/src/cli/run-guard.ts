import { pathToFileURL } from "node:url";

/** 判断当前模块是否是被直接执行的入口（而非被 pipeline 引用）。 */
export function isDirectRun(metaUrl: string): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return metaUrl === pathToFileURL(entry).href;
  } catch {
    return false;
  }
}
